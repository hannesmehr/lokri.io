import { NextResponse, type NextRequest } from "next/server";
import {
  apiError,
  authErrorResponse,
  serverError,
} from "@/lib/api/errors";
import { ApiAuthError, requireSessionWithAccount } from "@/lib/api/session";
import { revokeInvite } from "@/lib/teams/invites";
import { InviteError, inviteErrorStatus } from "@/lib/teams/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; inviteId: string }> };

/** Revoke a pending invite. `minRole: 'admin'` + active-team scope check. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { ownerAccountId, accountType, session } =
      await requireSessionWithAccount({ minRole: "admin" });
    const { id, inviteId } = await params;
    if (id !== ownerAccountId || accountType !== "team") {
      return apiError("Team not in active context", 403);
    }
    try {
      await revokeInvite({
        inviteId,
        ownerAccountId,
        actorUserId: session.user.id,
      });
      return new NextResponse(null, { status: 204 });
    } catch (err) {
      if (err instanceof InviteError) {
        return apiError(err.message, inviteErrorStatus(err.code), {
          code: err.code,
        });
      }
      throw err;
    }
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    return serverError(err);
  }
}
