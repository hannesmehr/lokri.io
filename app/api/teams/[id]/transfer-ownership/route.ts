import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  apiError,
  ApiAuthError,
  authErrorResponse,
  codedApiError,
  parseJsonBody,
  serverError,
  zodError,
} from "@/lib/api/errors";
import { requireSessionWithAccount } from "@/lib/api/session";
import { TeamError, teamErrorStatus } from "@/lib/teams/errors";
import { transferOwnership } from "@/lib/teams/ownership";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  newOwnerUserId: z.string().min(1).max(200),
});

/**
 * Transfer the owner role from the acting user to another member.
 *
 * `minRole: 'owner'` at the HTTP boundary; the service re-verifies the
 * claim inside a transaction so a stale session can't bypass it. The
 * target must already be `admin` — we don't auto-promote from member to
 * owner in one step (too easy to mis-click in a dropdown).
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { ownerAccountId, accountType, session } =
      await requireSessionWithAccount({ minRole: "owner" });
    const { id } = await params;
    if (id !== ownerAccountId || accountType !== "team") {
      return apiError("Team not in active context", 403);
    }

    const json = await parseJsonBody(req, 1024);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) return zodError(parsed.error);

    try {
      await transferOwnership({
        ownerAccountId,
        currentOwnerUserId: session.user.id,
        newOwnerUserId: parsed.data.newOwnerUserId,
      });
      return NextResponse.json({ ok: true });
    } catch (err) {
      if (err instanceof TeamError) {
        return codedApiError(teamErrorStatus(err.code), err.code, err.message);
      }
      throw err;
    }
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[api/teams.transfer-ownership]", err);
    return serverError(err);
  }
}
