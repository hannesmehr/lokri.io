import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ownerAccountMembers, ownerAccounts } from "@/lib/db/schema";

const FREE_PLAN_ID = "free";

/**
 * Resolves the current session from request cookies. Throws `ApiAuthError` if
 * there isn't one; route handlers catch it and reply 401.
 */
export class ApiAuthError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "ApiAuthError";
  }
}

export async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new ApiAuthError();
  return session;
}

/**
 * Find (or reconcile) the personal owner_account for a user.
 *
 * The signup hook (`lib/auth.ts`) creates this automatically, but the hook is
 * best-effort — if it failed, we self-heal here so API calls don't 500 on the
 * next request. A user always has exactly one personal owner_account in the
 * MVP (teams arrive V2).
 */
export async function getOrCreateOwnerAccountForUser(
  userId: string,
  userName?: string | null,
): Promise<string> {
  const existing = await db
    .select({ id: ownerAccounts.id })
    .from(ownerAccountMembers)
    .innerJoin(
      ownerAccounts,
      eq(ownerAccountMembers.ownerAccountId, ownerAccounts.id),
    )
    .where(
      and(
        eq(ownerAccountMembers.userId, userId),
        eq(ownerAccounts.type, "personal"),
        eq(ownerAccountMembers.role, "owner"),
      ),
    )
    .limit(1);

  if (existing.length > 0) return existing[0].id;

  const [created] = await db
    .insert(ownerAccounts)
    .values({
      type: "personal",
      name: userName ?? "Personal",
      planId: FREE_PLAN_ID,
    })
    .returning({ id: ownerAccounts.id });

  await db.insert(ownerAccountMembers).values({
    ownerAccountId: created.id,
    userId,
    role: "owner",
  });

  return created.id;
}

/**
 * One-stop helper for route handlers: get session + owner_account_id in one
 * call. Use this for anything account-scoped (spaces, notes, files, tokens).
 */
export async function requireSessionWithAccount() {
  const session = await requireSession();
  const ownerAccountId = await getOrCreateOwnerAccountForUser(
    session.user.id,
    session.user.name,
  );
  return { session, ownerAccountId };
}
