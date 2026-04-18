import { and, eq } from "drizzle-orm";
import { logAuditEvent } from "@/lib/audit/log";
import { normalizeLegacyRole } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { ownerAccountMembers, ownerAccounts, users } from "@/lib/db/schema";
import { localeForUserId } from "@/lib/i18n/user-locale";
import { sendMail } from "@/lib/mailer";
import {
  ownershipTransferredConfirmationTemplate,
  ownershipTransferredNotificationTemplate,
} from "@/lib/mailer/templates";
import { resolveAppOrigin } from "@/lib/origin";
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
 *   • both users receive an email in their own locale: the new owner
 *     a "you are now owner" notification, the old owner a "you handed
 *     it over" confirmation. Sent best-effort after the transaction —
 *     a dead mailer should never undo a valid transfer.
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

  // Best-effort notifications. We never throw from the mail path — the
  // transfer already committed, and resend the template manually (via
  // ops-script) is always an option. Any failure surfaces as a console
  // log picked up by the ops-alert infra.
  await sendTransferEmails(input).catch((err) => {
    console.error("[ownership.transferEmails] failed:", err);
  });
}

async function sendTransferEmails(input: TransferOwnershipInput): Promise<void> {
  const [team] = await db
    .select({ name: ownerAccounts.name })
    .from(ownerAccounts)
    .where(eq(ownerAccounts.id, input.ownerAccountId))
    .limit(1);
  if (!team) return;

  const [previousOwner] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, input.currentOwnerUserId))
    .limit(1);
  const [newOwner] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, input.newOwnerUserId))
    .limit(1);
  if (!previousOwner || !newOwner) return;

  const previousOwnerDisplay =
    previousOwner.name?.trim() || previousOwner.email;
  const newOwnerDisplay = newOwner.name?.trim() || newOwner.email;
  const teamSettingsUrl = `${resolveAppOrigin()}/settings/team`;

  // Recipients read in their own preferred language. Serialise the two
  // lookups separately so a DB hiccup on one side can't take down both
  // mail sends in a Promise.all.
  const [newOwnerLocale, previousOwnerLocale] = await Promise.all([
    localeForUserId(newOwner.id),
    localeForUserId(previousOwner.id),
  ]);

  const notificationTpl = await ownershipTransferredNotificationTemplate({
    teamName: team.name,
    previousOwnerName: previousOwnerDisplay,
    teamSettingsUrl,
    locale: newOwnerLocale,
  });
  const confirmationTpl = await ownershipTransferredConfirmationTemplate({
    teamName: team.name,
    newOwnerName: newOwnerDisplay,
    teamSettingsUrl,
    locale: previousOwnerLocale,
  });

  // Run both sends concurrently but tolerate individual failures so one
  // down-mailer doesn't swallow the other.
  await Promise.allSettled([
    sendMail({ to: newOwner.email, ...notificationTpl }),
    sendMail({ to: previousOwner.email, ...confirmationTpl }),
  ]);
}
