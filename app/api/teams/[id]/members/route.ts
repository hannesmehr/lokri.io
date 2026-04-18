import { NextResponse, type NextRequest } from "next/server";
import {
  apiError,
  authErrorResponse,
  serverError,
} from "@/lib/api/errors";
import { ApiAuthError, requireSessionWithAccount } from "@/lib/api/session";
import { listMembers } from "@/lib/teams/members";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { ownerAccountId, accountType } = await requireSessionWithAccount();
    const { id } = await params;
    if (id !== ownerAccountId || accountType !== "team") {
      return apiError("Team not in active context", 403);
    }
    const members = await listMembers(ownerAccountId);
    return NextResponse.json({ members });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    return serverError(err);
  }
}
