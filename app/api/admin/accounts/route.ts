import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import {
  ApiAuthError,
  apiError,
  authErrorResponse,
  parseJsonBody,
  serverError,
  zodError,
} from "@/lib/api/errors";
import { requireAdminSession } from "@/lib/api/session";
import { logAdminActionOnAccount } from "@/lib/admin/audit";
import {
  createAccountSchema,
  type CreateAccountInput,
} from "@/lib/admin/create-account-schema";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  ownerAccountMembers,
  ownerAccounts,
  plans,
  usageQuota,
  users,
} from "@/lib/db/schema";

export const runtime = "nodejs";

const querySchema = z.object({
  q: z.string().trim().max(200).optional(),
  type: z.enum(["personal", "team"]).optional(),
  planId: z.string().trim().max(50).optional(),
  sort: z.enum(["created", "name", "usage"]).default("created"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

/**
 * Admin-Liste aller Owner-Accounts (personal + team).
 *
 * Pro Zeile wird die Member-Zahl und der belegte Speicherplatz via
 * Subqueries nachgeladen — für typische Dimension (≲ 10k Accounts)
 * billiger als eine GROUP BY-Aggregation, außerdem einfacher auf
 * Sortier-Level umzuschalten.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdminSession();

    const parsed = querySchema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams),
    );
    if (!parsed.success) return zodError(parsed.error);
    const q = parsed.data;

    const conditions = [];
    if (q.q) conditions.push(ilike(ownerAccounts.name, `%${q.q}%`));
    if (q.type) conditions.push(eq(ownerAccounts.type, q.type));
    if (q.planId) conditions.push(eq(ownerAccounts.planId, q.planId));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const memberCount = sql<number>`
      (SELECT count(*)::int FROM ${ownerAccountMembers}
        WHERE ${ownerAccountMembers.ownerAccountId} = ${ownerAccounts.id})`;
    const usedBytes = sql<number>`
      (SELECT coalesce(${usageQuota.usedBytes}, 0)::bigint FROM ${usageQuota}
        WHERE ${usageQuota.ownerAccountId} = ${ownerAccounts.id})`;

    const orderCol =
      q.sort === "name"
        ? ownerAccounts.name
        : q.sort === "usage"
          ? usedBytes
          : ownerAccounts.createdAt;
    const orderExpr = q.order === "asc" ? orderCol : desc(orderCol);

    const offset = (q.page - 1) * q.pageSize;

    const [rows, [{ total }]] = await Promise.all([
      db
        .select({
          id: ownerAccounts.id,
          name: ownerAccounts.name,
          type: ownerAccounts.type,
          planId: ownerAccounts.planId,
          planName: plans.name,
          planExpiresAt: ownerAccounts.planExpiresAt,
          createdAt: ownerAccounts.createdAt,
          quotaOverride: ownerAccounts.quotaOverride,
          memberCount,
          usedBytes,
        })
        .from(ownerAccounts)
        .innerJoin(plans, eq(plans.id, ownerAccounts.planId))
        .where(where)
        .orderBy(orderExpr)
        .limit(q.pageSize)
        .offset(offset),
      db
        .select({ total: sql<number>`count(*)::int` })
        .from(ownerAccounts)
        .where(where),
    ]);

    return NextResponse.json({
      accounts: rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        planExpiresAt: r.planExpiresAt ? r.planExpiresAt.toISOString() : null,
        usedBytes: Number(r.usedBytes ?? 0),
        memberCount: Number(r.memberCount ?? 0),
      })),
      total: Number(total),
      page: q.page,
      pageSize: q.pageSize,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[admin.accounts.list]", err);
    return serverError(err);
  }
}

// ---------------------------------------------------------------------------
// POST — Admin legt manuell einen Team-Account an
// ---------------------------------------------------------------------------

// Diskurs: wir bauen den Create-Flow hier direkt statt `createTeam()`
// aus `lib/teams/create.ts` wiederzuverwenden. `createTeam()`:
//   (a) erzwingt den `users.canCreateTeams`-Gate — Admin soll das
//       absichtlich umgehen können (Ops-Provisioning)
//   (b) fixiert `planId = "team"` — Admin braucht Plan-Flexibilität
//       (Ops-Legacy-Migration auf `free`, Test-Accounts auf `trial`-
//       Varianten wenn wir sie jemals einführen)
//   (c) macht den Creator automatisch zum Owner — Admin will das
//       Owner-Assignment explizit steuern, inkl. orphaned-Accounts
//
// Audit-Event `admin.account.created` wird über
// `logAdminActionOnAccount` geschrieben (analog zu den existierenden
// `admin.account.{name,plan,quota_override}_changed`-Events).

void (null as CreateAccountInput | null); // IDE-Completion-Hilfe

export async function POST(req: NextRequest) {
  try {
    const { userId: actorId } = await requireAdminSession();

    const body = await parseJsonBody(req, 4096);
    const parsed = createAccountSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);
    const input = parsed.data;

    // Plan existiert?
    const [plan] = await db
      .select({ id: plans.id })
      .from(plans)
      .where(eq(plans.id, input.planId))
      .limit(1);
    if (!plan) {
      return apiError(`Unbekannter Plan: ${input.planId}`, 400, {
        code: "admin.account.planNotFound",
      });
    }

    // Owner-User existiert? Nur wenn gesetzt.
    let ownerUser: { id: string; email: string } | null = null;
    if (input.ownerUserId) {
      const [row] = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.id, input.ownerUserId))
        .limit(1);
      if (!row) {
        return apiError("Owner-User nicht gefunden.", 404, {
          code: "admin.account.ownerNotFound",
        });
      }
      ownerUser = row;
    }

    // Quota-Override normalisieren: `null`-Felder entfernen, leeres
    // Objekt wird zu `null` (kein Override) in der DB.
    const normalizedOverride = input.quotaOverride
      ? Object.fromEntries(
          Object.entries(input.quotaOverride).filter(
            ([, v]) => v !== undefined && v !== null,
          ),
        )
      : null;
    const overrideToPersist =
      normalizedOverride && Object.keys(normalizedOverride).length > 0
        ? (normalizedOverride as { bytes?: number; files?: number; notes?: number })
        : null;

    // Transactional: owner_accounts + (optional) owner_account_members
    // + usage_quota in einer Transaktion.
    const account = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(ownerAccounts)
        .values({
          type: "team",
          name: input.name,
          planId: input.planId,
          quotaOverride: overrideToPersist,
        })
        .returning({
          id: ownerAccounts.id,
          name: ownerAccounts.name,
          type: ownerAccounts.type,
          planId: ownerAccounts.planId,
          createdAt: ownerAccounts.createdAt,
        });

      if (ownerUser) {
        await tx.insert(ownerAccountMembers).values({
          ownerAccountId: created.id,
          userId: ownerUser.id,
          role: "owner",
          invitedByUserId: actorId,
        });
      }

      // Quota-Row seeden (leer); `ensureQuotaRow` in `getQuota` würde
      // das auch tun, aber konsistent nach Transaktion.
      await tx
        .insert(usageQuota)
        .values({ ownerAccountId: created.id })
        .onConflictDoNothing();

      return created;
    });

    // Audit — aussen, damit ein Audit-Hiccup die Response nicht
    // blockiert. Fire-and-forget analog zu anderen Admin-Routes.
    await logAdminActionOnAccount({
      actorAdminUserId: actorId,
      ownerAccountId: account.id,
      action: "admin.account.created",
      targetType: "account",
      targetId: account.id,
      metadata: {
        name: account.name,
        planId: account.planId,
        ownerUserId: ownerUser?.id ?? null,
        ownerEmail: ownerUser?.email ?? null,
        quotaOverride: overrideToPersist,
      },
    });

    return NextResponse.json(
      {
        account: {
          id: account.id,
          name: account.name,
          type: account.type,
          planId: account.planId,
          createdAt: account.createdAt.toISOString(),
        },
        ownerUserId: ownerUser?.id ?? null,
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[admin.accounts.create]", err);
    return serverError(err);
  }
}
