import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import {
  authErrorResponse,
  notFound,
  serverError,
} from "@/lib/api/errors";
import { ApiAuthError, requireSessionWithAccount } from "@/lib/api/session";
import { logAuditEvent } from "@/lib/audit/log";
import { db } from "@/lib/db";
import { apiTokens } from "@/lib/db/schema";

type Params = { params: Promise<{ id: string }> };

/** Revoke (soft-delete) a token. Hard-delete would orphan audit history. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { ownerAccountId, session } = await requireSessionWithAccount({ minRole: "member" });
    const { id } = await params;

    const [row] = await db
      .update(apiTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(apiTokens.id, id), eq(apiTokens.ownerAccountId, ownerAccountId)),
      )
      .returning({
        id: apiTokens.id,
        name: apiTokens.name,
        scopeType: apiTokens.scopeType,
      });

    if (!row) return notFound();

    await logAuditEvent({
      ownerAccountId,
      actorUserId: session.user.id,
      action: "token.revoked",
      targetType: "token",
      targetId: row.id,
      metadata: { name: row.name, scopeType: row.scopeType },
    });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    return serverError(err);
  }
}
