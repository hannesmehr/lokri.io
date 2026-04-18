import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  ApiAuthError,
  authErrorResponse,
  serverError,
  zodError,
} from "@/lib/api/errors";
import { requireAdminSession } from "@/lib/api/session";
import { db } from "@/lib/db";
import {
  ownerAccountMembers,
  ownerAccounts,
  plans,
  usageQuota,
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
