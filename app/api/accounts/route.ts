import { NextResponse } from "next/server";
import { authErrorResponse, serverError } from "@/lib/api/errors";
import { ApiAuthError, requireSession } from "@/lib/api/session";
import { listAccountsForUser } from "@/lib/teams/list";

export const runtime = "nodejs";

/** List every owner_account the caller is a member of — feeds the
 *  account switcher + any "where can I go" UI. */
export async function GET() {
  try {
    const session = await requireSession();
    const accounts = await listAccountsForUser(session.user.id);
    return NextResponse.json({ accounts });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    return serverError(err);
  }
}
