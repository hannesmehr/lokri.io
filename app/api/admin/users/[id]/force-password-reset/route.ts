import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import {
  ApiAuthError,
  authErrorResponse,
  notFound,
  serverError,
} from "@/lib/api/errors";
import { requireAdminSession } from "@/lib/api/session";
import { logAdminActionOnUser } from "@/lib/admin/audit";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * Admin-getriggerter Passwort-Reset.
 *
 * Nutzt Better-Auth's eigenen `forgetPassword`-Flow unter der Haube —
 * der User bekommt genau die Mail, die er beim "Passwort vergessen"-
 * Formular bekommen würde. Admin erfährt nur, dass die Mail rausging;
 * kein Token-Leak an den Admin-Client.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { userId: actorId } = await requireAdminSession();
    const { id } = await params;

    const [user] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!user) return notFound();

    // Better-Auth liefert den Reset-Mail-Flow über die öffentliche
    // requestPasswordReset-Route. Wir rufen sie intern auf, als würde
    // der User selbst "Passwort vergessen" klicken.
    await auth.api.requestPasswordReset({
      body: {
        email: user.email,
        redirectTo: "/reset-password",
      },
    });

    await logAdminActionOnUser({
      actorAdminUserId: actorId,
      targetUserId: id,
      action: "admin.user.password_reset_forced",
      metadata: { email: user.email },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[admin.users.force-reset]", err);
    return serverError(err);
  }
}
