import { eq } from "drizzle-orm";
import { logAuditEvent } from "@/lib/audit/log";
import { db } from "@/lib/db";
import {
  ownerAccountMembers,
  ownerAccounts,
  usageQuota,
  users,
} from "@/lib/db/schema";
import { TeamError } from "./errors";

const TEAM_PLAN_ID = "team";
const MAX_NAME_LEN = 200;

export interface CreateTeamInput {
  /** Must match the authenticated user — routes pass this through from
   *  `requireSessionWithAccount().session.user.id`. */
  userId: string;
  name: string;
}

export interface CreateTeamResult {
  account: {
    id: string;
    name: string;
    type: "team";
    planId: string;
    createdAt: Date;
  };
}

/**
 * Create a fresh team account owned by `userId`.
 *
 * Gated on `users.can_create_teams === true` — beta flag, flipped manually
 * by an admin. Self-service + checkout arrives in a later milestone.
 *
 * Transactional: account + owner-member + initial quota row are written
 * together. If anything fails, nothing is left behind. The audit row is
 * written *after* the transaction commits — losing it on a crash is
 * acceptable and better than dragging a non-critical side-effect into
 * the hot path.
 */
export async function createTeam(
  input: CreateTeamInput,
): Promise<CreateTeamResult> {
  const name = input.name.trim();
  if (!name) throw new TeamError("NAME_REQUIRED");
  if (name.length > MAX_NAME_LEN) throw new TeamError("NAME_TOO_LONG");

  // Gate check outside the transaction — cheaper than rolling back, and
  // we can surface the disabled-error immediately.
  const [user] = await db
    .select({ canCreateTeams: users.canCreateTeams })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);
  if (!user) throw new TeamError("NOT_FOUND", "User not found");
  if (!user.canCreateTeams) {
    throw new TeamError(
      "CREATE_DISABLED",
      "Team-Erstellung ist derzeit nicht freigeschaltet.",
    );
  }

  const account = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(ownerAccounts)
      .values({
        type: "team",
        name,
        planId: TEAM_PLAN_ID,
      })
      .returning({
        id: ownerAccounts.id,
        name: ownerAccounts.name,
        type: ownerAccounts.type,
        planId: ownerAccounts.planId,
        createdAt: ownerAccounts.createdAt,
      });

    await tx.insert(ownerAccountMembers).values({
      ownerAccountId: created.id,
      userId: input.userId,
      role: "owner",
      // `invitedByUserId` stays null — the creator invited themselves.
    });

    // Seed the quota counters at zero so `reserveQuota` has a row to
    // increment on the very first upload. Skipping this means `ensureQuotaRow`
    // inside `getQuota` would auto-create it anyway, but doing it here
    // keeps the account self-consistent after the transaction.
    await tx
      .insert(usageQuota)
      .values({ ownerAccountId: created.id })
      .onConflictDoNothing();

    return created;
  });

  await logAuditEvent({
    ownerAccountId: account.id,
    actorUserId: input.userId,
    action: "team.created",
    targetType: "team",
    targetId: account.id,
    metadata: { name: account.name },
  });

  // TS narrowing: `account.type` is the enum type, we know it's "team" by construction.
  return {
    account: {
      ...account,
      type: "team" as const,
    },
  };
}
