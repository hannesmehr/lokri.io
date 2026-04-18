import { and, eq } from "drizzle-orm";
import { logAuditEvent } from "@/lib/audit/log";
import { normalizeLegacyRole } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { ownerAccountMembers } from "@/lib/db/schema";
import { TeamError } from "./errors";

/**
 * Atomically hand the owner role from the current owner to a sitting
 * admin. The new owner must already be an admin — we deliberately don't
 * auto-promote a `member` in the same step so the outgoing owner has to
 * make the trust decision twice (promote → then transfer). Protects
 * against typos in the dropdown.
 *
 * Post-condition:
 *   • exactly one row with `role='owner'` for the account (the target)
 *   • the former owner becomes `admin`
 *
 * Callers have already checked the HTTP-level role gate via
 * `requireSessionWithAccount({ minRole: 'owner' })` — the service re-
 * verifies the DB state inside the transaction in case the caller's
 * session was stale.
 */
export interface TransferOwnershipInput {
  ownerAccountId: string;
  currentOwnerUserId: string;
  newOwnerUserId: string;
}

export async function transferOwnership(
  input: TransferOwnershipInput,
): Promise<void> {
  if (input.currentOwnerUserId === input.newOwnerUserId) {
    throw new TeamError("OWNER_TRANSFER_SELF");
  }

  await db.transaction(async (tx) => {
    // Re-read both member rows inside the txn to block races where the
    // target is demoted / removed between the HTTP check and this write.
    const rows = await tx
      .select({
        userId: ownerAccountMembers.userId,
        role: ownerAccountMembers.role,
      })
      .from(ownerAccountMembers)
      .where(eq(ownerAccountMembers.ownerAccountId, input.ownerAccountId));

    const current = rows.find((r) => r.userId === input.currentOwnerUserId);
    const target = rows.find((r) => r.userId === input.newOwnerUserId);
    if (!current) throw new TeamError("NOT_FOUND");
    if (!target) throw new TeamError("NOT_FOUND");

    if (normalizeLegacyRole(current.role) !== "owner") {
      throw new TeamError("OWNER_TRANSFER_NOT_OWNER");
    }
    if (normalizeLegacyRole(target.role) !== "admin") {
      throw new TeamError("OWNER_TRANSFER_NOT_ADMIN");
    }

    // Demote outgoing owner first. If we promoted the new owner first
    // and the demotion failed, we'd momentarily have two owners.
    await tx
      .update(ownerAccountMembers)
      .set({ role: "admin" })
      .where(
        and(
          eq(ownerAccountMembers.ownerAccountId, input.ownerAccountId),
          eq(ownerAccountMembers.userId, input.currentOwnerUserId),
        ),
      );

    await tx
      .update(ownerAccountMembers)
      .set({ role: "owner" })
      .where(
        and(
          eq(ownerAccountMembers.ownerAccountId, input.ownerAccountId),
          eq(ownerAccountMembers.userId, input.newOwnerUserId),
        ),
      );
  });

  await logAuditEvent({
    ownerAccountId: input.ownerAccountId,
    actorUserId: input.currentOwnerUserId,
    action: "team.ownership_transferred",
    targetType: "user",
    targetId: input.newOwnerUserId,
    metadata: {
      fromUserId: input.currentOwnerUserId,
      toUserId: input.newOwnerUserId,
    },
  });
}
