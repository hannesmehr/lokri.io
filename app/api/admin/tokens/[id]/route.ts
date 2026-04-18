import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import {
  ApiAuthError,
  authErrorResponse,
  notFound,
  serverError,
} from "@/lib/api/errors";
import { requireAdminSession } from "@/lib/api/session";
import { logAdminActionOnAccount } from "@/lib/admin/audit";
import { db } from "@/lib/db";
import { apiTokens } from "@/lib/db/schema";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * Einzelner Token-Revoke. Setzt `revoked_at` auf now(). Re-Revoke ist
 * ein No-Op: bereits revoked → 200 ohne Audit-Spam.
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { userId: actorId } = await requireAdminSession();
    const { id } = await params;

    const [token] = await db
      .select({
        id: apiTokens.id,
        name: apiTokens.name,
        ownerAccountId: apiTokens.ownerAccountId,
        revokedAt: apiTokens.revokedAt,
      })
      .from(apiTokens)
      .where(eq(apiTokens.id, id))
      .limit(1);
    if (!token) return notFound();

    if (token.revokedAt) {
      return NextResponse.json({ ok: true, noop: true });
    }

    await db
      .update(apiTokens)
      .set({ revokedAt: new Date() })
      .where(eq(apiTokens.id, id));

    await logAdminActionOnAccount({
      actorAdminUserId: actorId,
      ownerAccountId: token.ownerAccountId,
      action: "admin.token.revoked",
      targetType: "api_token",
      targetId: token.id,
      metadata: { name: token.name },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[admin.tokens.revoke]", err);
    return serverError(err);
  }
}
