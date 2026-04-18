import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { ownerAccounts, plans, usageQuota } from "@/lib/db/schema";

const FREE_PLAN_ID = "free";
type QuotaExecutor = Pick<typeof db, "insert" | "update" | "execute">;

export interface QuotaDelta {
  /** Bytes to add (negative to subtract). */
  bytes?: number;
  /** File rows to add (negative to subtract). */
  files?: number;
  /** Note rows to add (negative to subtract). */
  notes?: number;
}

export interface QuotaStatus {
  planId: string;
  usedBytes: number;
  filesCount: number;
  notesCount: number;
  maxBytes: number;
  maxFiles: number;
  maxNotes: number;
}

async function ensureQuotaRow(
  ownerAccountId: string,
  executor: QuotaExecutor = db,
): Promise<void> {
  await executor
    .insert(usageQuota)
    .values({ ownerAccountId })
    .onConflictDoNothing();
}

/**
 * Current quota + limits for an owner_account.
 *
 * Expiry logic: if `plan_expires_at` has passed (or is NULL for paid plans),
 * we transparently fall back to the free plan's limits. The `plan_id`
 * column stays untouched for invoice/audit history; a renewal simply bumps
 * `plan_expires_at` again.
 */
export async function getQuota(ownerAccountId: string): Promise<QuotaStatus> {
  await ensureQuotaRow(ownerAccountId);

  // Pull both the current plan row AND the free plan in one go so we can
  // swap without a second query when expired.
  const [row] = await db
    .select({
      planId: plans.id,
      planExpiresAt: ownerAccounts.planExpiresAt,
      usedBytes: usageQuota.usedBytes,
      filesCount: usageQuota.filesCount,
      notesCount: usageQuota.notesCount,
      maxBytes: plans.maxBytes,
      maxFiles: plans.maxFiles,
      maxNotes: plans.maxNotes,
    })
    .from(usageQuota)
    .innerJoin(ownerAccounts, eq(ownerAccounts.id, usageQuota.ownerAccountId))
    .innerJoin(plans, eq(plans.id, ownerAccounts.planId))
    .where(eq(usageQuota.ownerAccountId, ownerAccountId));

  if (!row) {
    throw new Error(
      `Quota lookup failed for owner_account ${ownerAccountId} — missing account or plan row`,
    );
  }

  const isFree = row.planId === FREE_PLAN_ID;
  const expired =
    !isFree && row.planExpiresAt !== null && row.planExpiresAt < new Date();
  // Also treat paid plans with no expiry set at all as expired (safe default).
  const needsFallback =
    !isFree && (row.planExpiresAt === null || expired);

  if (!needsFallback) {
    return {
      planId: row.planId,
      usedBytes: row.usedBytes,
      filesCount: row.filesCount,
      notesCount: row.notesCount,
      maxBytes: row.maxBytes,
      maxFiles: row.maxFiles,
      maxNotes: row.maxNotes,
    };
  }

  // Fall back to free-plan limits. Single extra query; cheap.
  const [free] = await db
    .select({
      maxBytes: plans.maxBytes,
      maxFiles: plans.maxFiles,
      maxNotes: plans.maxNotes,
    })
    .from(plans)
    .where(eq(plans.id, FREE_PLAN_ID));
  if (!free) {
    throw new Error("Free plan row missing — re-run pnpm db:seed.");
  }
  return {
    planId: FREE_PLAN_ID,
    usedBytes: row.usedBytes,
    filesCount: row.filesCount,
    notesCount: row.notesCount,
    maxBytes: free.maxBytes,
    maxFiles: free.maxFiles,
    maxNotes: free.maxNotes,
  };
}

export type QuotaCheckResult =
  | { ok: true }
  | { ok: false; reason: string; code: "bytes" | "files" | "notes" };

/**
 * Returns `ok: true` iff the pending delta fits under the plan limits.
 * Does NOT apply the delta — call `applyQuotaDelta` after a successful write.
 */
export async function checkQuota(
  ownerAccountId: string,
  delta: QuotaDelta,
): Promise<QuotaCheckResult> {
  const q = await getQuota(ownerAccountId);
  const bytes = delta.bytes ?? 0;
  const files = delta.files ?? 0;
  const notes = delta.notes ?? 0;

  if (q.usedBytes + bytes > q.maxBytes) {
    return {
      ok: false,
      code: "bytes",
      reason: `Storage quota exceeded (${q.usedBytes + bytes} > ${q.maxBytes} bytes).`,
    };
  }
  if (q.filesCount + files > q.maxFiles) {
    return {
      ok: false,
      code: "files",
      reason: `File count quota exceeded (${q.filesCount + files} > ${q.maxFiles}).`,
    };
  }
  if (q.notesCount + notes > q.maxNotes) {
    return {
      ok: false,
      code: "notes",
      reason: `Note count quota exceeded (${q.notesCount + notes} > ${q.maxNotes}).`,
    };
  }
  return { ok: true };
}

/**
 * Apply a usage delta atomically via SQL increment. Accepts negative values
 * on delete paths. Clamps at 0 to avoid negative-usage bugs.
 */
export async function applyQuotaDelta(
  ownerAccountId: string,
  delta: QuotaDelta,
  executor: QuotaExecutor = db,
): Promise<void> {
  await ensureQuotaRow(ownerAccountId, executor);

  const bytesDelta = delta.bytes ?? 0;
  const filesDelta = delta.files ?? 0;
  const notesDelta = delta.notes ?? 0;

  if (bytesDelta === 0 && filesDelta === 0 && notesDelta === 0) return;

  await executor
    .update(usageQuota)
    .set({
      usedBytes: sql`GREATEST(0, ${usageQuota.usedBytes} + ${bytesDelta})`,
      filesCount: sql`GREATEST(0, ${usageQuota.filesCount} + ${filesDelta})`,
      notesCount: sql`GREATEST(0, ${usageQuota.notesCount} + ${notesDelta})`,
      updatedAt: new Date(),
    })
    .where(eq(usageQuota.ownerAccountId, ownerAccountId));
}

/**
 * Atomically reserves positive quota inside a transaction / statement.
 *
 * This closes the race where two concurrent requests both pass `checkQuota`
 * against the same snapshot and together overshoot the plan limit.
 */
export async function reserveQuota(
  ownerAccountId: string,
  delta: QuotaDelta,
  executor: QuotaExecutor = db,
): Promise<QuotaCheckResult> {
  await ensureQuotaRow(ownerAccountId, executor);

  const bytesDelta = delta.bytes ?? 0;
  const filesDelta = delta.files ?? 0;
  const notesDelta = delta.notes ?? 0;

  if (bytesDelta < 0 || filesDelta < 0 || notesDelta < 0) {
    throw new Error("reserveQuota only supports non-negative deltas.");
  }
  if (bytesDelta === 0 && filesDelta === 0 && notesDelta === 0) {
    return { ok: true };
  }

  const result = await executor.execute(sql`
    WITH limits AS (
      SELECT
        uq.owner_account_id,
        uq.used_bytes,
        uq.files_count,
        uq.notes_count,
        CASE
          WHEN oa.plan_id <> ${FREE_PLAN_ID}
            AND (oa.plan_expires_at IS NULL OR oa.plan_expires_at < now())
          THEN fp.max_bytes
          ELSE cp.max_bytes
        END AS max_bytes,
        CASE
          WHEN oa.plan_id <> ${FREE_PLAN_ID}
            AND (oa.plan_expires_at IS NULL OR oa.plan_expires_at < now())
          THEN fp.max_files
          ELSE cp.max_files
        END AS max_files,
        CASE
          WHEN oa.plan_id <> ${FREE_PLAN_ID}
            AND (oa.plan_expires_at IS NULL OR oa.plan_expires_at < now())
          THEN fp.max_notes
          ELSE cp.max_notes
        END AS max_notes
      FROM usage_quota uq
      INNER JOIN owner_accounts oa ON oa.id = uq.owner_account_id
      INNER JOIN plans cp ON cp.id = oa.plan_id
      INNER JOIN plans fp ON fp.id = ${FREE_PLAN_ID}
      WHERE uq.owner_account_id = ${ownerAccountId}
    )
    UPDATE usage_quota uq
    SET
      used_bytes = uq.used_bytes + ${bytesDelta},
      files_count = uq.files_count + ${filesDelta},
      notes_count = uq.notes_count + ${notesDelta},
      updated_at = now()
    FROM limits
    WHERE
      uq.owner_account_id = limits.owner_account_id
      AND limits.used_bytes + ${bytesDelta} <= limits.max_bytes
      AND limits.files_count + ${filesDelta} <= limits.max_files
      AND limits.notes_count + ${notesDelta} <= limits.max_notes
    RETURNING uq.owner_account_id
  `);

  const rows = Array.isArray((result as { rows?: unknown[] }).rows)
    ? ((result as { rows: unknown[] }).rows ?? [])
    : [];
  if (rows.length > 0) return { ok: true };
  return checkQuota(ownerAccountId, delta);
}
