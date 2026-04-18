import { and, eq, isNull, sql } from "drizzle-orm";
import { logAuditEvent } from "@/lib/audit/log";
import {
  type MemberRole,
  normalizeLegacyRole,
} from "@/lib/auth/roles";
import { db } from "@/lib/db";
import {
  apiTokens,
  ownerAccountMembers,
  users,
} from "@/lib/db/schema";
import { TeamError } from "./errors";

export interface TeamMember {
  userId: string;
  name: string;
  email: string;
  role: MemberRole;
  joinedAt: Date;
  invitedByUserId: string | null;
  invitedByName: string | null;
}

export async function listMembers(
  ownerAccountId: string,
): Promise<TeamMember[]> {
  const inviter = db.$with("inviter").as(
    db
      .select({
        id: users.id,
        name: users.name,
      })
      .from(users),
  );

  const rows = await db
    .with(inviter)
    .select({
      userId: ownerAccountMembers.userId,
      name: users.name,
      email: users.email,
      role: ownerAccountMembers.role,
      joinedAt: ownerAccountMembers.joinedAt,
      invitedByUserId: ownerAccountMembers.invitedByUserId,
      invitedByName: inviter.name,
    })
    .from(ownerAccountMembers)
    .innerJoin(users, eq(users.id, ownerAccountMembers.userId))
    .leftJoin(inviter, eq(inviter.id, ownerAccountMembers.invitedByUserId))
    .where(eq(ownerAccountMembers.ownerAccountId, ownerAccountId))
    .orderBy(ownerAccountMembers.joinedAt);

  return rows.map((r) => ({
    userId: r.userId,
    name: r.name,
    email: r.email,
    role: normalizeLegacyRole(r.role),
    joinedAt: r.joinedAt,
    invitedByUserId: r.invitedByUserId,
    invitedByName: r.invitedByName,
  }));
}

/**
 * Count other owners in the team — used to prevent the last owner from
 * being demoted or removed. Excludes the subject user so the check works
 * for "am I the only owner?" type questions.
 */
async function otherOwnerCount(
  ownerAccountId: string,
  excludeUserId: string,
): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(ownerAccountMembers)
    .where(
      and(
        eq(ownerAccountMembers.ownerAccountId, ownerAccountId),
        eq(ownerAccountMembers.role, "owner"),
        sql`${ownerAccountMembers.userId} <> ${excludeUserId}`,
      ),
    );
  return Number(row?.n ?? 0);
}

// ---------------------------------------------------------------------------
// changeMemberRole
// ---------------------------------------------------------------------------

export interface ChangeRoleInput {
  ownerAccountId: string;
  actorUserId: string;
  /** Target member to mutate. Routes usually get this from `[userId]` param. */
  targetUserId: string;
  nextRole: MemberRole;
}

export async function changeMemberRole(input: ChangeRoleInput): Promise<void> {
  const [member] = await db
    .select({
      userId: ownerAccountMembers.userId,
      role: ownerAccountMembers.role,
    })
    .from(ownerAccountMembers)
    .where(
      and(
        eq(ownerAccountMembers.ownerAccountId, input.ownerAccountId),
        eq(ownerAccountMembers.userId, input.targetUserId),
      ),
    )
    .limit(1);
  if (!member) throw new TeamError("team.notFound");

  const oldRole = normalizeLegacyRole(member.role);
  if (oldRole === input.nextRole) return; // no-op

  // Owner protection: demoting the sole owner to anything else would
  // leave the team orphaned. Route-level role check already enforced
  // that the actor is at least `admin`; here we only guard the owner.
  if (oldRole === "owner" && input.nextRole !== "owner") {
    const others = await otherOwnerCount(
      input.ownerAccountId,
      input.targetUserId,
    );
    if (others === 0) throw new TeamError("team.ownerProtected");
  }

  await db
    .update(ownerAccountMembers)
    .set({ role: input.nextRole })
    .where(
      and(
        eq(ownerAccountMembers.ownerAccountId, input.ownerAccountId),
        eq(ownerAccountMembers.userId, input.targetUserId),
      ),
    );

  await logAuditEvent({
    ownerAccountId: input.ownerAccountId,
    actorUserId: input.actorUserId,
    action: "member.role_changed",
    targetType: "user",
    targetId: input.targetUserId,
    metadata: { oldRole, newRole: input.nextRole },
  });
}

// ---------------------------------------------------------------------------
// removeMember
// ---------------------------------------------------------------------------

export interface RemoveMemberInput {
  ownerAccountId: string;
  actorUserId: string;
  targetUserId: string;
}

export async function removeMember(input: RemoveMemberInput): Promise<void> {
  const [member] = await db
    .select({
      userId: ownerAccountMembers.userId,
      role: ownerAccountMembers.role,
    })
    .from(ownerAccountMembers)
    .where(
      and(
        eq(ownerAccountMembers.ownerAccountId, input.ownerAccountId),
        eq(ownerAccountMembers.userId, input.targetUserId),
      ),
    )
    .limit(1);
  if (!member) throw new TeamError("team.notFound");

  const targetRole = normalizeLegacyRole(member.role);
  if (targetRole === "owner") throw new TeamError("team.ownerProtected");

  // Revoke all personal-scope tokens this user created for this account —
  // they're user-bound and should die with the membership. Team-scoped
  // tokens stay alive.
  const revoked = await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(apiTokens.ownerAccountId, input.ownerAccountId),
        eq(apiTokens.scopeType, "personal"),
        eq(apiTokens.createdByUserId, input.targetUserId),
        isNull(apiTokens.revokedAt),
      ),
    )
    .returning({ id: apiTokens.id });

  await db
    .delete(ownerAccountMembers)
    .where(
      and(
        eq(ownerAccountMembers.ownerAccountId, input.ownerAccountId),
        eq(ownerAccountMembers.userId, input.targetUserId),
      ),
    );

  // If the removed user had this team set as active, blank it — the FK is
  // set-null on ownerAccounts delete but not on member delete, so do it
  // manually here.
  await db
    .update(users)
    .set({ activeOwnerAccountId: null })
    .where(
      and(
        eq(users.id, input.targetUserId),
        eq(users.activeOwnerAccountId, input.ownerAccountId),
      ),
    );

  await logAuditEvent({
    ownerAccountId: input.ownerAccountId,
    actorUserId: input.actorUserId,
    action: "member.removed",
    targetType: "user",
    targetId: input.targetUserId,
    metadata: { role: targetRole },
  });

  if (revoked.length > 0) {
    await logAuditEvent({
      ownerAccountId: input.ownerAccountId,
      actorUserId: input.actorUserId,
      action: "token.revoked_on_member_remove",
      targetType: "user",
      targetId: input.targetUserId,
      metadata: { tokenIds: revoked.map((r) => r.id) },
    });
  }
}
