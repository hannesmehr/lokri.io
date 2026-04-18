import { eq } from "drizzle-orm";
import { logAuditEvent } from "@/lib/audit/log";
import { db } from "@/lib/db";
import { ownerAccountMembers, ownerAccounts } from "@/lib/db/schema";

/**
 * Admin-Audit-Wrapper.
 *
 * Admin-Aktionen mutieren fremde User / Accounts; der `owner_account_id`
 * des Audit-Events wird auf den **Personal-Account des betroffenen Users**
 * gesetzt, damit der User (bzw. dessen zukünftige Betrachtung der eigenen
 * Audit-Spur) die Aktion nachvollziehen kann. Für Aktionen gegen
 * Team-Accounts setzen wir direkt die Team-`ownerAccountId`.
 *
 * Alle admin-seitig ausgelösten Actions tragen den Prefix `admin.*`.
 */

interface AdminActionBase {
  actorAdminUserId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Audit-Event, das auf den Personal-Account eines betroffenen Users läuft. */
export async function logAdminActionOnUser(
  input: AdminActionBase & { targetUserId: string },
): Promise<void> {
  const [row] = await db
    .select({ id: ownerAccounts.id })
    .from(ownerAccountMembers)
    .innerJoin(
      ownerAccounts,
      eq(ownerAccountMembers.ownerAccountId, ownerAccounts.id),
    )
    .where(eq(ownerAccountMembers.userId, input.targetUserId))
    .limit(1);
  if (!row) return; // user ohne zugehörigen Account — unerreichbar für Audit
  await logAuditEvent({
    ownerAccountId: row.id,
    actorUserId: input.actorAdminUserId,
    action: input.action,
    targetType: input.targetType ?? "user",
    targetId: input.targetId ?? input.targetUserId,
    metadata: input.metadata ?? null,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
  });
}

/** Audit-Event, das auf einen spezifischen Owner-Account läuft. */
export async function logAdminActionOnAccount(
  input: AdminActionBase & { ownerAccountId: string },
): Promise<void> {
  await logAuditEvent({
    ownerAccountId: input.ownerAccountId,
    actorUserId: input.actorAdminUserId,
    action: input.action,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    metadata: input.metadata ?? null,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
  });
}
