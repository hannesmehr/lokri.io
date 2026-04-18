import { eq } from "drizzle-orm";
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
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { limit, rateLimitResponse } from "@/lib/rate-limit";
import { createTeam } from "@/lib/teams/create";
import { TeamError, teamErrorStatus } from "@/lib/teams/errors";

export const runtime = "nodejs";

const createBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
});

/**
 * Create a new team account for the authenticated user.
 *
 * Auth: plain `requireSession` — we don't need account-scoping here
 * because a team is created *outside* any existing team's context.
 * The `can_create_teams` gate is enforced inside `createTeam()`.
 *
 * Side effects on success:
 *   1. Fresh row in `owner_accounts` (type=team, plan=team).
 *   2. User is the sole owner in `owner_account_members`.
 *   3. Empty `usage_quota` seeded.
 *   4. `users.active_owner_account_id` is pointed at the new team — so
 *      the next request (via the dashboard redirect) lands inside the
 *      newly created team without a manual switcher click.
 *   5. Audit row `team.created`.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();

    // Bucket: same as `tokenCreate` — cheap endpoint, but we want to
    // prevent abuse (unlimited accounts = unlimited quota + storage).
    const rl = await limit("tokenCreate", `u:${session.user.id}`);
    if (!rl.ok) return rateLimitResponse(rl);

    const json = await parseJsonBody(req, 4096);
    const parsed = createBodySchema.safeParse(json);
    if (!parsed.success) return zodError(parsed.error);

    let result: Awaited<ReturnType<typeof createTeam>>;
    try {
      result = await createTeam({
        userId: session.user.id,
        name: parsed.data.name,
      });
    } catch (err) {
      if (err instanceof TeamError) {
        return apiError(err.message, teamErrorStatus(err.code), {
          code: err.code,
        });
      }
      throw err;
    }

    // Point the switcher at the new team so the client can just
    // `router.refresh()` or `location.href = "/dashboard"` without
    // POSTing to /api/accounts/active separately.
    await db
      .update(users)
      .set({ activeOwnerAccountId: result.account.id })
      .where(eq(users.id, session.user.id));

    return NextResponse.json(
      {
        account: result.account,
        redirectTo: "/dashboard",
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[api/teams.POST]", err);
    return serverError(err);
  }
}
