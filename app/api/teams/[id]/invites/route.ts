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
import { limit, rateLimitResponse } from "@/lib/rate-limit";
import {
  createInvite,
  listPendingInvites,
} from "@/lib/teams/invites";
import { InviteError, inviteErrorStatus } from "@/lib/teams/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const createBodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  role: z.enum(["admin", "member", "viewer"]),
});

/**
 * GET — list pending invites (non-accepted, non-revoked, non-expired).
 * Used by the Team-Settings Members page.
 *
 * The route-param `id` must match the active team account — otherwise the
 * `requireSessionWithAccount` check already lands on the wrong account
 * scope and returns 403 via the team-param check below.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { ownerAccountId, accountType } = await requireSessionWithAccount({
      minRole: "admin",
    });
    const { id } = await params;
    if (id !== ownerAccountId || accountType !== "team") {
      return apiError("Team not in active context", 403);
    }
    const invites = await listPendingInvites(ownerAccountId);
    return NextResponse.json({ invites });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    return serverError(err);
  }
}

/** POST — create a new invite and send the magic-link email. */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { ownerAccountId, accountType, session } =
      await requireSessionWithAccount({ minRole: "admin" });
    const { id } = await params;
    if (id !== ownerAccountId || accountType !== "team") {
      return apiError("Team not in active context", 403);
    }

    const rl = await limit("tokenCreate", `u:${session.user.id}`);
    if (!rl.ok) return rateLimitResponse(rl);

    const body = await parseJsonBody(req, 4096);
    const parsed = createBodySchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    try {
      const result = await createInvite({
        ownerAccountId,
        actorUserId: session.user.id,
        email: parsed.data.email,
        role: parsed.data.role,
      });
      return NextResponse.json({ invite: result }, { status: 201 });
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
    console.error("[api/teams.invites.POST]", err);
    return serverError(err);
  }
}
