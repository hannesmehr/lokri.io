import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  apiError,
  authErrorResponse,
  parseJsonBody,
  serverError,
  zodError,
} from "@/lib/api/errors";
import { ApiAuthError, requireSessionWithAccount } from "@/lib/api/session";
import {
  changeMemberRole,
  removeMember,
} from "@/lib/teams/members";
import { TeamError, teamErrorStatus } from "@/lib/teams/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; userId: string }> };

const patchBodySchema = z.object({
  role: z.enum(["owner", "admin", "member", "viewer"]),
});

/** PATCH — change a member's role. `minRole: 'admin'`. */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { ownerAccountId, accountType, session, role: actorRole } =
      await requireSessionWithAccount({ minRole: "admin" });
    const { id, userId } = await params;
    if (id !== ownerAccountId || accountType !== "team") {
      return apiError("Team not in active context", 403);
    }
    const body = await parseJsonBody(req, 1024);
    const parsed = patchBodySchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    // Only owners can promote to owner. Admins can reassign member/viewer
    // among the team.
    if (parsed.data.role === "owner" && actorRole !== "owner") {
      return apiError("Only owners may promote to owner", 403);
    }

    // Can't change own role via this endpoint (avoids footguns). Owner
    // transfer is a separate future flow.
    if (session.user.id === userId) {
      return apiError("Cannot change your own role", 400);
    }

    try {
      await changeMemberRole({
        ownerAccountId,
        actorUserId: session.user.id,
        targetUserId: userId,
        nextRole: parsed.data.role,
      });
      return NextResponse.json({ ok: true });
    } catch (err) {
      if (err instanceof TeamError) {
        return apiError(err.message, teamErrorStatus(err.code), {
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

/** DELETE — remove a member. `minRole: 'admin'`. Owner-protection in service. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { ownerAccountId, accountType, session } =
      await requireSessionWithAccount({ minRole: "admin" });
    const { id, userId } = await params;
    if (id !== ownerAccountId || accountType !== "team") {
      return apiError("Team not in active context", 403);
    }
    if (session.user.id === userId) {
      return apiError("Cannot remove yourself", 400);
    }
    try {
      await removeMember({
        ownerAccountId,
        actorUserId: session.user.id,
        targetUserId: userId,
      });
      return new NextResponse(null, { status: 204 });
    } catch (err) {
      if (err instanceof TeamError) {
        return apiError(err.message, teamErrorStatus(err.code), {
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
