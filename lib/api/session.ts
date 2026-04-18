import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { ApiAuthError } from "@/lib/api/errors";
import {
  hasRole,
  normalizeLegacyRole,
  type MemberRole,
} from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { ownerAccountMembers, ownerAccounts, users } from "@/lib/db/schema";

const FREE_PLAN_ID = "free";

// Back-compat re-export so the ~25 existing call sites that import
// `ApiAuthError` from `@/lib/api/session` keep working without a sweep.
// New code should import directly from `@/lib/api/errors`.
export { ApiAuthError };

export async function requireSession(): Promise<AuthSession> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new ApiAuthError();
  return session as AuthSession;
}

/**
 * Find (or reconcile) the personal owner_account for a user.
 *
 * The signup hook (`lib/auth.ts`) creates this automatically, but the hook is
 * best-effort — if it failed, we self-heal here so API calls don't 500 on the
 * next request. A user always has exactly one personal owner_account.
 *
 * Teams are separate `owner_accounts` rows (type='team'); they are NEVER
 * auto-created here, only by the explicit team-creation flow.
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

/** Non-null session returned by `requireSession` — narrows away the `null`
 *  branch of Better-Auth's `getSession` signature. */
export type AuthSession = NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
>;

export interface SessionContext {
  session: AuthSession;
  ownerAccountId: string;
  role: MemberRole;
  accountType: "personal" | "team";
}

export interface RequireSessionOptions {
  /**
   * Minimum role the caller must hold in the active account. Defaults to
   * `viewer` — i.e. any member of the account is allowed. Routes that
   * mutate state should tighten this (`member` for content, `admin` for
   * team management, `owner` for billing/delete).
   */
  minRole?: MemberRole;
}

/**
 * One-stop helper for route handlers: get session + active owner_account +
 * role in one call.
 *
 * Active-account resolution:
 *   1. If `users.active_owner_account_id` is set AND the user is still a
 *      member of that account → use it. This is the account-switcher state.
 *   2. Otherwise fall back to the user's personal account (auto-reconciled
 *      by `getOrCreateOwnerAccountForUser`). This is also the path for
 *      users who never touched the switcher.
 *
 * Role resolution: read the `owner_account_members` row for (user, account)
 * and normalise legacy values (`editor` → `member`, `reader` → `viewer`).
 *
 * `minRole` check: throws `ApiAuthError('Forbidden', 403)` on failure.
 * Routes catch `ApiAuthError` and use `err.status` to return 401 or 403.
 */
export async function requireSessionWithAccount(
  options: RequireSessionOptions = {},
): Promise<SessionContext> {
  const session = await requireSession();
  const userId = session.user.id;

  // Preferred: whatever the user last selected via the switcher.
  const [userRow] = await db
    .select({
      activeOwnerAccountId: users.activeOwnerAccountId,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  let ownerAccountId: string | null = null;
  let accountType: "personal" | "team" | null = null;
  let role: MemberRole | null = null;

  if (userRow?.activeOwnerAccountId) {
    const [candidate] = await db
      .select({
        accountId: ownerAccounts.id,
        accountType: ownerAccounts.type,
        role: ownerAccountMembers.role,
      })
      .from(ownerAccountMembers)
      .innerJoin(
        ownerAccounts,
        eq(ownerAccountMembers.ownerAccountId, ownerAccounts.id),
      )
      .where(
        and(
          eq(ownerAccountMembers.userId, userId),
          eq(ownerAccounts.id, userRow.activeOwnerAccountId),
        ),
      )
      .limit(1);
    if (candidate) {
      ownerAccountId = candidate.accountId;
      accountType = candidate.accountType;
      role = normalizeLegacyRole(candidate.role);
    }
    // Stale pointer (user left the team, or team was deleted and FK
    // set-null raced a session refresh) → silently fall through to
    // personal-account path below.
  }

  if (!ownerAccountId) {
    ownerAccountId = await getOrCreateOwnerAccountForUser(
      userId,
      session.user.name,
    );
    accountType = "personal";
    role = "owner"; // by construction — personal accounts have exactly one owner
  }

  const minRole = options.minRole ?? "viewer";
  if (!hasRole(role!, minRole)) {
    throw new ApiAuthError(
      `Requires role ${minRole}, have ${role}.`,
      403,
    );
  }

  return {
    session,
    ownerAccountId: ownerAccountId!,
    role: role!,
    accountType: accountType!,
  };
}
