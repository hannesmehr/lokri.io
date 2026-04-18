import { and, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
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
import { auditEvents, ownerAccounts, users } from "@/lib/db/schema";

export const runtime = "nodejs";

const querySchema = z.object({
  q: z.string().trim().max(200).optional(),
  action: z.string().trim().max(80).optional(),
  actorUserId: z.string().trim().max(80).optional(),
  ownerAccountId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  sort: z.enum(["createdAt", "action"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

/**
 * Audit-Event-Liste für das Admin-UI. Volltextsuche matcht auf
 * Actor-Email, Action und Target-ID. Filter pro Feld einzeln, plus
 * Zeitraum.
 *
 * Performance: die Indexe auf `(owner_account_id, created_at DESC)` und
 * `action` decken die typischen Pfade ab. Volltextsuche fällt auf
 * sequential scans zurück — für den aktuellen Log-Volumen okay; wenn
 * das Event-Volumen in die Millionen geht, tsvector-Index nachziehen.
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
          ilike(users.email, pattern),
          ilike(auditEvents.action, pattern),
          ilike(auditEvents.targetId, pattern),
        ),
      );
    }
    if (q.action) conditions.push(eq(auditEvents.action, q.action));
    if (q.actorUserId) conditions.push(eq(auditEvents.actorUserId, q.actorUserId));
    if (q.ownerAccountId)
      conditions.push(eq(auditEvents.ownerAccountId, q.ownerAccountId));
    if (q.from) conditions.push(gte(auditEvents.createdAt, new Date(q.from)));
    if (q.to) conditions.push(lte(auditEvents.createdAt, new Date(q.to)));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const orderCol =
      q.sort === "action" ? auditEvents.action : auditEvents.createdAt;
    const orderExpr = q.order === "asc" ? orderCol : desc(orderCol);

    const offset = (q.page - 1) * q.pageSize;

    const [rows, [{ total }]] = await Promise.all([
      db
        .select({
          id: auditEvents.id,
          action: auditEvents.action,
          targetType: auditEvents.targetType,
          targetId: auditEvents.targetId,
          actorUserId: auditEvents.actorUserId,
          actorEmail: users.email,
          ownerAccountId: auditEvents.ownerAccountId,
          ownerAccountName: ownerAccounts.name,
          ipAddress: auditEvents.ipAddress,
          createdAt: auditEvents.createdAt,
        })
        .from(auditEvents)
        .leftJoin(users, eq(users.id, auditEvents.actorUserId))
        .innerJoin(
          ownerAccounts,
          eq(ownerAccounts.id, auditEvents.ownerAccountId),
        )
        .where(where)
        .orderBy(orderExpr)
        .limit(q.pageSize)
        .offset(offset),
      db
        .select({ total: sql<number>`count(*)::int` })
        .from(auditEvents)
        .leftJoin(users, eq(users.id, auditEvents.actorUserId))
        .where(where),
    ]);

    return NextResponse.json({
      events: rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
      })),
      total: Number(total),
      page: q.page,
      pageSize: q.pageSize,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[admin.audit.list]", err);
    return serverError(err);
  }
}
