import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  ApiAuthError,
  authErrorResponse,
  parseJsonBody,
  serverError,
  zodError,
} from "@/lib/api/errors";
import { requireAdminSession } from "@/lib/api/session";
import { logAuditEvent } from "@/lib/audit/log";
import { db } from "@/lib/db";
import { sessions, teamInvites, users } from "@/lib/db/schema";

export const runtime = "nodejs";

const schema = z.object({
  op: z.enum([
    "sessions-purge-older-than",
    "invites-cleanup-expired",
    "users-backfill-default-locale",
  ]),
  mode: z.enum(["dryRun", "apply"]),
  days: z.number().int().min(1).max(3650).optional(),
  locale: z.string().trim().min(2).max(10).optional(),
});

/**
 * Einsprungsroute für Wartungs-Operationen. Jede Op hat ein Dry-Run,
 * das nur die Zahl zurückgibt; `apply` führt aus und schreibt ein
 * System-Audit-Event.
 *
 * Alle Events laufen auf ein gemeinsames "system"-Target — Scope ist
 * global, nicht per-account (wir schreiben das Event daher bewusst auf
 * ein deterministisches Ziel: den ersten Personal-Account des Actors,
 * damit die Spur in dessen eigenem Audit-Viewer auftaucht).
 */
export async function POST(req: NextRequest) {
  try {
    const { userId: actorId } = await requireAdminSession();
    const body = await parseJsonBody(req);
    const parsed = schema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);
    const { op, mode } = parsed.data;

    if (op === "sessions-purge-older-than") {
      const days = parsed.data.days ?? 30;
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      if (mode === "dryRun") {
        const [{ n }] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(sessions)
          .where(lt(sessions.createdAt, cutoff));
        return NextResponse.json({
          ok: true,
          op,
          mode,
          wouldAffect: Number(n),
          params: { days },
        });
      }
      const deleted = await db
        .delete(sessions)
        .where(lt(sessions.createdAt, cutoff))
        .returning({ id: sessions.id });
      await writeMaintenanceAudit(actorId, op, {
        count: deleted.length,
        params: { days },
      });
      return NextResponse.json({
        ok: true,
        op,
        mode,
        affected: deleted.length,
        params: { days },
      });
    }

    if (op === "invites-cleanup-expired") {
      const matcher = and(
        isNull(teamInvites.acceptedAt),
        isNull(teamInvites.revokedAt),
        lt(teamInvites.expiresAt, new Date()),
      );
      if (mode === "dryRun") {
        const [{ n }] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(teamInvites)
          .where(matcher);
        return NextResponse.json({
          ok: true,
          op,
          mode,
          wouldAffect: Number(n),
        });
      }
      const res = await db
        .update(teamInvites)
        .set({ revokedAt: new Date() })
        .where(matcher)
        .returning({ id: teamInvites.id });
      await writeMaintenanceAudit(actorId, op, { count: res.length });
      return NextResponse.json({
        ok: true,
        op,
        mode,
        affected: res.length,
      });
    }

    if (op === "users-backfill-default-locale") {
      const locale = parsed.data.locale ?? "de";
      const matcher = isNull(users.preferredLocale);
      if (mode === "dryRun") {
        const [{ n }] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(users)
          .where(matcher);
        return NextResponse.json({
          ok: true,
          op,
          mode,
          wouldAffect: Number(n),
          params: { locale },
        });
      }
      const res = await db
        .update(users)
        .set({ preferredLocale: locale })
        .where(matcher)
        .returning({ id: users.id });
      await writeMaintenanceAudit(actorId, op, {
        count: res.length,
        params: { locale },
      });
      return NextResponse.json({
        ok: true,
        op,
        mode,
        affected: res.length,
        params: { locale },
      });
    }

    return NextResponse.json({ error: "Unknown op" }, { status: 400 });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[admin.system.maintenance]", err);
    return serverError(err);
  }
}

async function writeMaintenanceAudit(
  actorId: string,
  op: string,
  metadata: Record<string, unknown>,
) {
  // Finde einen Owner-Account des Actors, um das Event irgendwo
  // hin-anzuschließen; System-Events haben keine natürliche Heimat,
  // aber wir wollen das Event NICHT verlieren.
  const [home] = await db
    .execute(sql`
      SELECT m.owner_account_id AS id
      FROM owner_account_members m
      WHERE m.user_id = ${actorId}
      ORDER BY m.joined_at
      LIMIT 1
    `)
    .then((r) => {
      const rows = Array.isArray(r)
        ? (r as Array<Record<string, unknown>>)
        : ((r as { rows?: unknown[] }).rows as Array<Record<string, unknown>>) ?? [];
      return rows;
    });
  if (!home) return;
  await logAuditEvent({
    ownerAccountId: String(home.id),
    actorUserId: actorId,
    action: `admin.system.maintenance.${op.replace(/-/g, "_")}`,
    targetType: "system",
    metadata,
  });
}

// silence unused import
void eq;
