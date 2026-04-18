import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getCachedStats } from "@/lib/admin/stats-cache";

/**
 * Admin-Stats-Service.
 *
 * Jede Funktion liefert ein kleines, typisiertes Ergebnis. Alle teuren
 * Queries gehen durch `getCachedStats` mit einer dem Use-Case
 * angemessenen TTL:
 *   - Schnell-KPIs (Counts/Sums): 60s
 *   - Zeitreihen / Breakdowns: 300s (5 Min)
 *
 * SQL wird bewusst in Raw-Strings gehalten — Drizzle-Aggregate-Syntax
 * würde den Code aufblähen ohne echten Gewinn, und die Queries sind
 * idempotent + rein lesend. Parametrisiert wird natürlich trotzdem
 * (Drizzles `sql` template macht das automatisch).
 */

// ── User-Metriken ────────────────────────────────────────────────────

export interface UserStats {
  totalUsers: number;
  verifiedUsers: number;
  signupsToday: number;
  signupsThisWeek: number;
  signupsThisMonth: number;
  dauLast30Days: number;
  mauLast30Days: number;
}

export async function getUserStats(): Promise<UserStats> {
  return getCachedStats("kpi.users", 60, async () => {
    const result = await db.execute(sql`
      SELECT
        (SELECT count(*)::int FROM users) AS total_users,
        (SELECT count(*)::int FROM users WHERE email_verified = true) AS verified_users,
        (SELECT count(*)::int FROM users WHERE created_at >= date_trunc('day', now())) AS signups_today,
        (SELECT count(*)::int FROM users WHERE created_at >= now() - interval '7 days') AS signups_week,
        (SELECT count(*)::int FROM users WHERE created_at >= now() - interval '30 days') AS signups_month,
        (SELECT count(DISTINCT user_id)::int FROM sessions
           WHERE created_at >= now() - interval '1 day') AS dau,
        (SELECT count(DISTINCT user_id)::int FROM sessions
           WHERE created_at >= now() - interval '30 days') AS mau
    `);
    const row = pickFirstRow(result);
    return {
      totalUsers: num(row.total_users),
      verifiedUsers: num(row.verified_users),
      signupsToday: num(row.signups_today),
      signupsThisWeek: num(row.signups_week),
      signupsThisMonth: num(row.signups_month),
      dauLast30Days: num(row.dau),
      mauLast30Days: num(row.mau),
    };
  });
}

// ── Account-Metriken ─────────────────────────────────────────────────

export interface AccountStats {
  totalPersonalAccounts: number;
  totalTeamAccounts: number;
  teamAccountsByPlan: Record<string, number>;
  avgSeatsPerTeam: number;
}

export async function getAccountStats(): Promise<AccountStats> {
  return getCachedStats("kpi.accounts", 60, async () => {
    const [totals, byPlan, seats] = await Promise.all([
      db.execute(sql`
        SELECT
          sum(CASE WHEN type = 'personal' THEN 1 ELSE 0 END)::int AS personal,
          sum(CASE WHEN type = 'team' THEN 1 ELSE 0 END)::int AS team
        FROM owner_accounts
      `),
      db.execute(sql`
        SELECT plan_id, count(*)::int AS n
        FROM owner_accounts
        WHERE type = 'team'
        GROUP BY plan_id
      `),
      db.execute(sql`
        SELECT coalesce(avg(seats), 0)::float AS avg_seats
        FROM (
          SELECT count(*) AS seats
          FROM owner_account_members m
          INNER JOIN owner_accounts oa ON oa.id = m.owner_account_id
          WHERE oa.type = 'team'
          GROUP BY m.owner_account_id
        ) s
      `),
    ]);

    const totalsRow = pickFirstRow(totals);
    const byPlanMap: Record<string, number> = {};
    for (const row of asRows(byPlan)) {
      byPlanMap[String(row.plan_id)] = num(row.n);
    }
    const seatsRow = pickFirstRow(seats);

    return {
      totalPersonalAccounts: num(totalsRow.personal),
      totalTeamAccounts: num(totalsRow.team),
      teamAccountsByPlan: byPlanMap,
      avgSeatsPerTeam: Number(seatsRow.avg_seats ?? 0),
    };
  });
}

// ── Business-Metriken (Revenue / MRR) ────────────────────────────────

export interface BusinessStats {
  mrrCents: number;
  revenueThisMonthCents: number;
  revenueLastMonthCents: number;
  paidUsersCount: number;
  freeUsersCount: number;
}

export async function getBusinessStats(): Promise<BusinessStats> {
  return getCachedStats("kpi.business", 60, async () => {
    // MRR: aktive paid Plans. Yearly wird durch 12 geteilt (normalisiert
    // auf Monatsbasis). Expired plans zählen nicht.
    // Team-Plans: price_per_seat × aktuelle Seat-Zahl.
    const [mrrResult, thisMonth, lastMonth, paidFree] = await Promise.all([
      db.execute(sql`
        WITH active AS (
          SELECT oa.id AS account_id, oa.plan_id, p.is_seat_based,
                 p.price_monthly_cents, p.price_yearly_cents,
                 p.price_per_seat_monthly_cents, p.price_per_seat_yearly_cents
          FROM owner_accounts oa
          INNER JOIN plans p ON p.id = oa.plan_id
          WHERE p.id <> 'free'
            AND (oa.plan_expires_at IS NULL OR oa.plan_expires_at > now())
        ),
        seats AS (
          SELECT owner_account_id, count(*)::int AS n
          FROM owner_account_members
          GROUP BY owner_account_id
        )
        SELECT coalesce(sum(
          CASE
            WHEN active.is_seat_based THEN
              coalesce(
                active.price_per_seat_monthly_cents,
                active.price_per_seat_yearly_cents / 12
              ) * coalesce(seats.n, 1)
            ELSE
              coalesce(
                active.price_monthly_cents,
                active.price_yearly_cents / 12
              )
          END
        ), 0)::bigint AS mrr_cents
        FROM active
        LEFT JOIN seats ON seats.owner_account_id = active.account_id
      `),
      db.execute(sql`
        SELECT coalesce(sum(gross_cents), 0)::bigint AS n
        FROM invoices
        WHERE status = 'paid'
          AND issued_at >= date_trunc('month', now())
      `),
      db.execute(sql`
        SELECT coalesce(sum(gross_cents), 0)::bigint AS n
        FROM invoices
        WHERE status = 'paid'
          AND issued_at >= date_trunc('month', now() - interval '1 month')
          AND issued_at <  date_trunc('month', now())
      `),
      db.execute(sql`
        SELECT
          (SELECT count(DISTINCT m.user_id)::int
             FROM owner_account_members m
             INNER JOIN owner_accounts oa ON oa.id = m.owner_account_id
             WHERE oa.plan_id <> 'free'
               AND (oa.plan_expires_at IS NULL OR oa.plan_expires_at > now())) AS paid,
          (SELECT count(*)::int FROM users) AS total
      `),
    ]);

    const mrr = num(pickFirstRow(mrrResult).mrr_cents);
    const tm = num(pickFirstRow(thisMonth).n);
    const lm = num(pickFirstRow(lastMonth).n);
    const pf = pickFirstRow(paidFree);
    const paid = num(pf.paid);
    const total = num(pf.total);

    return {
      mrrCents: mrr,
      revenueThisMonthCents: tm,
      revenueLastMonthCents: lm,
      paidUsersCount: paid,
      freeUsersCount: Math.max(0, total - paid),
    };
  });
}

// ── System-Metriken (Storage) ────────────────────────────────────────

export interface SystemStats {
  totalBytesStored: number;
  storageByProvider: Record<string, number>;
  totalFiles: number;
  totalNotes: number;
  totalSpaces: number;
}

export async function getSystemStats(): Promise<SystemStats> {
  return getCachedStats("kpi.system", 60, async () => {
    const [sums, byProvider] = await Promise.all([
      db.execute(sql`
        SELECT
          (SELECT coalesce(sum(used_bytes), 0)::bigint FROM usage_quota) AS total_bytes,
          (SELECT count(*)::int FROM files) AS total_files,
          (SELECT count(*)::int FROM notes) AS total_notes,
          (SELECT count(*)::int FROM spaces) AS total_spaces
      `),
      db.execute(sql`
        SELECT
          coalesce(sp.type::text, 'vercel_blob') AS provider,
          coalesce(sum(f.size_bytes), 0)::bigint AS bytes
        FROM files f
        LEFT JOIN storage_providers sp ON sp.id = f.storage_provider_id
        GROUP BY provider
      `),
    ]);

    const sumsRow = pickFirstRow(sums);
    const byProviderMap: Record<string, number> = {};
    for (const row of asRows(byProvider)) {
      byProviderMap[String(row.provider)] = num(row.bytes);
    }
    return {
      totalBytesStored: num(sumsRow.total_bytes),
      storageByProvider: byProviderMap,
      totalFiles: num(sumsRow.total_files),
      totalNotes: num(sumsRow.total_notes),
      totalSpaces: num(sumsRow.total_spaces),
    };
  });
}

// ── Zeitreihen ───────────────────────────────────────────────────────

export interface TimeseriesPoint {
  date: string;
  value: number;
}

export async function getSignupsTimeseries(days: number): Promise<TimeseriesPoint[]> {
  const clamped = Math.min(Math.max(days, 1), 3650);
  return getCachedStats(`ts.signups.${clamped}`, 300, async () => {
    const result = await db.execute(sql`
      WITH series AS (
        SELECT generate_series(
          date_trunc('day', now() - (${clamped - 1} * interval '1 day')),
          date_trunc('day', now()),
          interval '1 day'
        ) AS day
      )
      SELECT to_char(s.day, 'YYYY-MM-DD') AS date,
             coalesce(c.n, 0)::int AS value
      FROM series s
      LEFT JOIN (
        SELECT date_trunc('day', created_at) AS day, count(*)::int AS n
        FROM users
        WHERE created_at >= now() - (${clamped} * interval '1 day')
        GROUP BY 1
      ) c ON c.day = s.day
      ORDER BY s.day
    `);
    return asRows(result).map((r) => ({
      date: String(r.date),
      value: num(r.value),
    }));
  });
}

export interface MRRPoint {
  month: string;
  mrrCents: number;
}

/**
 * MRR-Zeitreihe auf Basis von Invoices (`gross_cents`) pro Monat —
 * vereinfacht: "tatsächlicher Umsatz pro Monat". Für eine kanonische
 * MRR-Kurve würden wir je Monat den damaligen Plan-Zustand
 * rekonstruieren müssen (teuer + spooky), das ist hier bewusst eine
 * Approximation.
 */
export async function getMRRTimeseries(months: number): Promise<MRRPoint[]> {
  const clamped = Math.min(Math.max(months, 1), 60);
  return getCachedStats(`ts.mrr.${clamped}`, 300, async () => {
    const result = await db.execute(sql`
      WITH series AS (
        SELECT generate_series(
          date_trunc('month', now() - ((${clamped} - 1) * interval '1 month')),
          date_trunc('month', now()),
          interval '1 month'
        ) AS month
      )
      SELECT to_char(s.month, 'YYYY-MM') AS month,
             coalesce(c.n, 0)::bigint AS value
      FROM series s
      LEFT JOIN (
        SELECT date_trunc('month', issued_at) AS month, sum(gross_cents) AS n
        FROM invoices
        WHERE status = 'paid'
          AND issued_at >= date_trunc('month', now() - (${clamped} * interval '1 month'))
        GROUP BY 1
      ) c ON c.month = s.month
      ORDER BY s.month
    `);
    return asRows(result).map((r) => ({
      month: String(r.month),
      mrrCents: num(r.value),
    }));
  });
}

export async function getDAUTimeseries(days: number): Promise<TimeseriesPoint[]> {
  const clamped = Math.min(Math.max(days, 1), 180);
  return getCachedStats(`ts.dau.${clamped}`, 300, async () => {
    const result = await db.execute(sql`
      WITH series AS (
        SELECT generate_series(
          date_trunc('day', now() - (${clamped - 1} * interval '1 day')),
          date_trunc('day', now()),
          interval '1 day'
        ) AS day
      )
      SELECT to_char(s.day, 'YYYY-MM-DD') AS date,
             coalesce(c.n, 0)::int AS value
      FROM series s
      LEFT JOIN (
        SELECT date_trunc('day', created_at) AS day,
               count(DISTINCT user_id)::int AS n
        FROM sessions
        WHERE created_at >= now() - (${clamped} * interval '1 day')
        GROUP BY 1
      ) c ON c.day = s.day
      ORDER BY s.day
    `);
    return asRows(result).map((r) => ({
      date: String(r.date),
      value: num(r.value),
    }));
  });
}

export interface RevenuePoint {
  month: string;
  revenueCents: number;
}

export async function getRevenueByMonth(months: number): Promise<RevenuePoint[]> {
  return (await getMRRTimeseries(months)).map((p) => ({
    month: p.month,
    revenueCents: p.mrrCents,
  }));
}

// ── Top-Listen ───────────────────────────────────────────────────────

export interface TopAccount {
  ownerAccountId: string;
  name: string;
  usedBytes: number;
}

export async function getTopAccountsByStorage(limit = 10): Promise<TopAccount[]> {
  const clamped = Math.min(Math.max(limit, 1), 100);
  return getCachedStats(`top.storage.${clamped}`, 300, async () => {
    const result = await db.execute(sql`
      SELECT oa.id AS owner_account_id, oa.name, q.used_bytes::bigint AS used_bytes
      FROM usage_quota q
      INNER JOIN owner_accounts oa ON oa.id = q.owner_account_id
      ORDER BY q.used_bytes DESC NULLS LAST
      LIMIT ${clamped}
    `);
    return asRows(result).map((r) => ({
      ownerAccountId: String(r.owner_account_id),
      name: String(r.name),
      usedBytes: num(r.used_bytes),
    }));
  });
}

export interface TopRevenueAccount {
  ownerAccountId: string;
  name: string;
  revenueCents: number;
  invoicesCount: number;
}

export async function getTopRevenueAccounts(limit = 10): Promise<TopRevenueAccount[]> {
  const clamped = Math.min(Math.max(limit, 1), 100);
  return getCachedStats(`top.revenue.${clamped}`, 300, async () => {
    const result = await db.execute(sql`
      SELECT oa.id AS owner_account_id,
             oa.name,
             coalesce(sum(i.gross_cents), 0)::bigint AS revenue_cents,
             count(i.id)::int AS invoices
      FROM invoices i
      INNER JOIN owner_accounts oa ON oa.id = i.owner_account_id
      WHERE i.status = 'paid'
      GROUP BY oa.id, oa.name
      ORDER BY revenue_cents DESC
      LIMIT ${clamped}
    `);
    return asRows(result).map((r) => ({
      ownerAccountId: String(r.owner_account_id),
      name: String(r.name),
      revenueCents: num(r.revenue_cents),
      invoicesCount: num(r.invoices),
    }));
  });
}

// ── Utils ────────────────────────────────────────────────────────────

function asRows(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  const rows = (result as { rows?: unknown }).rows;
  return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];
}

function pickFirstRow(result: unknown): Record<string, unknown> {
  return asRows(result)[0] ?? {};
}

function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}
