import { and, eq } from "drizzle-orm";
import type { MemberRole } from "@/lib/auth/roles";
import { normalizeLegacyRole } from "@/lib/auth/roles";
import { ownerAccountMembers } from "@/lib/db/schema";

/**
 * Liest die kanonische Team-Rolle eines Users für ein bestimmtes Team.
 * `null` bedeutet: keine Mitgliedschaft in diesem Team.
 */
export async function getTeamRoleForUser(
  userId: string,
  ownerAccountId: string,
): Promise<MemberRole | null> {
  const { db } = await import("@/lib/db");
  const [member] = await db
    .select({ role: ownerAccountMembers.role })
    .from(ownerAccountMembers)
    .where(
      and(
        eq(ownerAccountMembers.userId, userId),
        eq(ownerAccountMembers.ownerAccountId, ownerAccountId),
      ),
    )
    .limit(1);

  return member ? normalizeLegacyRole(member.role) : null;
}

/**
 * Prüft, ob ein User die SSO-Konfiguration eines Teams verwalten darf.
 * Gate: strikt nur Team-Owner.
 */
export function canManageSsoRole(role: MemberRole | null): boolean {
  return role === "owner";
}

/**
 * Prüft, ob ein User die SSO-Konfiguration eines Teams verwalten darf.
 * Gate: strikt nur Team-Owner.
 */
export async function canManageSsoForTeam(
  userId: string,
  ownerAccountId: string,
): Promise<boolean> {
  const role = await getTeamRoleForUser(userId, ownerAccountId);
  return canManageSsoRole(role);
}
