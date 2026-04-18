import { and, asc, desc, eq, gte, ilike, lte, or } from "drizzle-orm";
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
  format: z.enum(["csv", "json"]).default("csv"),
  q: z.string().trim().max(200).optional(),
  action: z.string().trim().max(80).optional(),
  actorUserId: z.string().trim().max(80).optional(),
  ownerAccountId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  /** Hard cap, schützt vor versehentlichen 10-Mio-Exports. */
  limit: z.coerce.number().int().min(1).max(50_000).default(10_000),
  order: z.enum(["asc", "desc"]).default("desc"),
});

/**
 * CSV- oder JSON-Export der gefilterten Audit-Events. Filter-Logik
 * identisch zur Liste, aber mit hart capptem Limit (10k Default,
 * max 50k).
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

    const rows = await db
      .select({
        id: auditEvents.id,
        createdAt: auditEvents.createdAt,
        action: auditEvents.action,
        actorUserId: auditEvents.actorUserId,
        actorEmail: users.email,
        ownerAccountId: auditEvents.ownerAccountId,
        ownerAccountName: ownerAccounts.name,
        targetType: auditEvents.targetType,
        targetId: auditEvents.targetId,
        ipAddress: auditEvents.ipAddress,
        userAgent: auditEvents.userAgent,
        metadata: auditEvents.metadata,
      })
      .from(auditEvents)
      .leftJoin(users, eq(users.id, auditEvents.actorUserId))
      .innerJoin(ownerAccounts, eq(ownerAccounts.id, auditEvents.ownerAccountId))
      .where(where)
      .orderBy(q.order === "asc" ? asc(auditEvents.createdAt) : desc(auditEvents.createdAt))
      .limit(q.limit);

    const ts = new Date().toISOString().slice(0, 10);

    if (q.format === "json") {
      return new NextResponse(JSON.stringify(rows, null, 2), {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-disposition": `attachment; filename="audit_${ts}.json"`,
          "cache-control": "private, no-store",
        },
      });
    }

    const header = [
      "ID",
      "Zeitstempel",
      "Action",
      "Actor-UserID",
      "Actor-Email",
      "OwnerAccount-ID",
      "OwnerAccount-Name",
      "TargetType",
      "TargetID",
      "IP",
      "User-Agent",
      "Metadata",
    ].join(";");
    const esc = (v: unknown): string => {
      if (v == null) return "";
      const s = typeof v === "string" ? v : JSON.stringify(v);
      if (/[;"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const lines = rows.map((r) =>
      [
        r.id,
        r.createdAt.toISOString(),
        r.action,
        r.actorUserId ?? "",
        esc(r.actorEmail ?? ""),
        r.ownerAccountId,
        esc(r.ownerAccountName),
        esc(r.targetType ?? ""),
        esc(r.targetId ?? ""),
        esc(r.ipAddress ?? ""),
        esc(r.userAgent ?? ""),
        esc(r.metadata),
      ].join(";"),
    );
    const csv = "\uFEFF" + [header, ...lines].join("\r\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="audit_${ts}.csv"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[admin.audit.export]", err);
    return serverError(err);
  }
}
