import { and, eq } from "drizzle-orm";
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
import { ownerAccountMembers, users } from "@/lib/db/schema";

export const runtime = "nodejs";

const bodySchema = z.object({
  ownerAccountId: z.string().uuid(),
});

/**
 * Flip the user's active account. Membership check is mandatory — without
 * it a malicious client could stick a foreign UUID in here and then every
 * subsequent `requireSessionWithAccount` call would fail in a confusing
 * way or, worse, land the user in an account they don't own.
 *
 * No audit event — this is pure preference, no security boundary crossed.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const json = await parseJsonBody(req, 1024);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) return zodError(parsed.error);

    const [membership] = await db
      .select({ id: ownerAccountMembers.id })
      .from(ownerAccountMembers)
      .where(
        and(
          eq(ownerAccountMembers.userId, session.user.id),
          eq(ownerAccountMembers.ownerAccountId, parsed.data.ownerAccountId),
        ),
      )
      .limit(1);
    if (!membership) {
      return apiError("Not a member of this account", 403);
    }

    await db
      .update(users)
      .set({ activeOwnerAccountId: parsed.data.ownerAccountId })
      .where(eq(users.id, session.user.id));

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    return serverError(err);
  }
}
