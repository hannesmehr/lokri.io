import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  apiError,
  authErrorResponse,
  parseJsonBody,
  serverError,
  zodError,
} from "@/lib/api/errors";
import { ApiAuthError, requireSession } from "@/lib/api/session";
import { acceptInvite } from "@/lib/teams/invites";
import { InviteError, inviteErrorStatus } from "@/lib/teams/errors";

export const runtime = "nodejs";

const bodySchema = z.object({
  token: z.string().min(10).max(500),
});

/**
 * Accept a team invite. Only needs a logged-in user — no team scope yet,
 * that's what we're trying to join. The service checks email-binding +
 * active-invite state; returns 400/409 on mismatch/expiry/already-member.
 *
 * On success, `users.active_owner_account_id` is flipped to the new
 * team inside the service transaction, so the client can immediately
 * redirect into `/dashboard` and land in the new context.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();

    const body = await parseJsonBody(req, 1024);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    try {
      const result = await acceptInvite({
        rawToken: parsed.data.token,
        userId: session.user.id,
      });
      return NextResponse.json({
        ownerAccountId: result.ownerAccountId,
        teamName: result.teamName,
        role: result.role,
        redirectTo: "/dashboard",
      });
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
    console.error("[api/invites/accept]", err);
    return serverError(err);
  }
}
