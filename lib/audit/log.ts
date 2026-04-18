import { db } from "@/lib/db";
import { auditEvents } from "@/lib/db/schema";

/**
 * Minimal audit-event writer.
 *
 * V1 scope: security-relevant events (team lifecycle, membership, tokens,
 * logins). Writes are fire-and-forget — if the insert fails, we log and
 * continue so the originating request isn't poisoned by a DB hiccup.
 *
 * The request-header flavour (`getAuditLogger(request)`) that extracts IP
 * + user-agent lives in step 9 once we wire up the actual call-sites.
 * For the team-creation path we only care about actor + action + context,
 * which this function already covers.
 */

export interface AuditLogInput {
  ownerAccountId: string;
  /** Null for system events (cron, delete-cascade, ...). */
  actorUserId: string | null;
  /** Slug-style: `team.created`, `member.invited`, `token.revoked`, etc. */
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  /** Free-form JSON — old/new role, token ids, reason strings. */
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function logAuditEvent(input: AuditLogInput): Promise<void> {
  try {
    await db.insert(auditEvents).values({
      ownerAccountId: input.ownerAccountId,
      actorUserId: input.actorUserId,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      metadata: input.metadata ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    });
  } catch (err) {
    // Never throw — auditing a side-effect should never break the user's
    // actual operation. We surface to console so ops alerts pick it up.
    console.error("[audit] insert failed:", err, { input });
  }
}
