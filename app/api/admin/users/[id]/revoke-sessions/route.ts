import { eq, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import {
  apiError,
  ApiAuthError,
  authErrorResponse,
  notFound,
  serverError,
} from "@/lib/api/errors";
import { requireAdminSession } from "@/lib/api/session";
import { logAdminActionOnUser } from "@/lib/admin/audit";
import { db } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** Sessions eines Users hart beenden. Self-Protection: Admin kann
 *  seine eigenen Sessions nicht über diesen Pfad killen (würde den
 *  laufenden Request killen). */
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { userId: actorId } = await requireAdminSession();
    const { id } = await params;
    if (actorId === id) {
      return apiError(
        "Nutze den normalen Logout, um deine eigene Session zu beenden.",
        400,
      );
    }

    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!user) return notFound();

    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(sessions)
      .where(eq(sessions.userId, id));

    await db.delete(sessions).where(eq(sessions.userId, id));

    await logAdminActionOnUser({
      actorAdminUserId: actorId,
      targetUserId: id,
      action: "admin.user.sessions_revoked",
      metadata: { count: Number(n) },
    });

    return NextResponse.json({ ok: true, revoked: Number(n) });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[admin.users.revoke-sessions]", err);
    return serverError(err);
  }
}
