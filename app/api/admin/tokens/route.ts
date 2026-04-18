import { and, asc, desc, eq, ilike, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
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
import { apiTokens, ownerAccounts, users } from "@/lib/db/schema";

export const runtime = "nodejs";

const querySchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.enum(["active", "revoked", "all"]).default("active"),
  scopeType: z.enum(["personal", "team"]).optional(),
  readOnly: z
    .string()
    .transform((v) => v === "1" || v === "true")
    .optional(),
  inactiveDays: z.coerce.number().int().min(0).max(3650).optional(),
  sort: z.enum(["created", "lastUsed", "name"]).default("created"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});

/**
 * Globaler Admin-Überblick über alle API-Tokens.
 *
 * "inactiveDays" markiert Tokens als "inaktiv" via der bekannten Regel:
 *   - `last_used_at < now() - X days`, ODER
 *   - `last_used_at IS NULL AND created_at < now() - X days`.
 * Das matcht, was der Bulk-Revoke-Endpunkt wegräumen würde — der Filter
 * hier ist nur für die Preview.
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
    if (q.q) {
      const pattern = `%${q.q}%`;
      conditions.push(
        or(
          ilike(apiTokens.name, pattern),
          ilike(apiTokens.tokenPrefix, pattern),
          ilike(users.email, pattern),
          ilike(ownerAccounts.name, pattern),
        ),
      );
    }
    if (q.status === "active") conditions.push(isNull(apiTokens.revokedAt));
    else if (q.status === "revoked")
      conditions.push(isNotNull(apiTokens.revokedAt));
    if (q.scopeType) conditions.push(eq(apiTokens.scopeType, q.scopeType));
    if (q.readOnly !== undefined)
      conditions.push(eq(apiTokens.readOnly, q.readOnly));

    if (q.inactiveDays !== undefined) {
      const cutoff = new Date(Date.now() - q.inactiveDays * 24 * 60 * 60 * 1000);
      conditions.push(
        or(
          and(isNotNull(apiTokens.lastUsedAt), lt(apiTokens.lastUsedAt, cutoff)),
          and(isNull(apiTokens.lastUsedAt), lt(apiTokens.createdAt, cutoff)),
        ),
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const orderCol =
      q.sort === "lastUsed"
        ? apiTokens.lastUsedAt
        : q.sort === "name"
          ? apiTokens.name
          : apiTokens.createdAt;
    const orderExpr =
      q.order === "asc"
        ? q.sort === "lastUsed"
          ? asc(orderCol)
          : orderCol
        : desc(orderCol);

    const offset = (q.page - 1) * q.pageSize;

    const [rows, [{ total }]] = await Promise.all([
      db
        .select({
          id: apiTokens.id,
          name: apiTokens.name,
          tokenPrefix: apiTokens.tokenPrefix,
          scopeType: apiTokens.scopeType,
          readOnly: apiTokens.readOnly,
          spaceScope: apiTokens.spaceScope,
          createdAt: apiTokens.createdAt,
          lastUsedAt: apiTokens.lastUsedAt,
          revokedAt: apiTokens.revokedAt,
          ownerAccountId: apiTokens.ownerAccountId,
          ownerAccountName: ownerAccounts.name,
          createdByUserId: apiTokens.createdByUserId,
          creatorEmail: users.email,
          creatorName: users.name,
        })
        .from(apiTokens)
        .innerJoin(
          ownerAccounts,
          eq(ownerAccounts.id, apiTokens.ownerAccountId),
        )
        .leftJoin(users, eq(users.id, apiTokens.createdByUserId))
        .where(where)
        .orderBy(orderExpr)
        .limit(q.pageSize)
        .offset(offset),
      db
        .select({ total: sql<number>`count(*)::int` })
        .from(apiTokens)
        .innerJoin(
          ownerAccounts,
          eq(ownerAccounts.id, apiTokens.ownerAccountId),
        )
        .leftJoin(users, eq(users.id, apiTokens.createdByUserId))
        .where(where),
    ]);

    return NextResponse.json({
      tokens: rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
        revokedAt: r.revokedAt ? r.revokedAt.toISOString() : null,
        spaceScope: r.spaceScope ?? null,
      })),
      total: Number(total),
      page: q.page,
      pageSize: q.pageSize,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[admin.tokens.list]", err);
    return serverError(err);
  }
}
