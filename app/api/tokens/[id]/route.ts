import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { notFound, serverError, unauthorized } from "@/lib/api/errors";
import { ApiAuthError, requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { apiTokens } from "@/lib/db/schema";

type Params = { params: Promise<{ id: string }> };

/** Revoke (soft-delete) a token. Hard-delete would orphan audit history. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { ownerAccountId } = await requireSessionWithAccount();
    const { id } = await params;

    const [row] = await db
      .update(apiTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(apiTokens.id, id), eq(apiTokens.ownerAccountId, ownerAccountId)),
      )
      .returning({ id: apiTokens.id });

    if (!row) return notFound();
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof ApiAuthError) return unauthorized(err.message);
    return serverError(err);
  }
}
