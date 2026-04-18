import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { ownerAccountMembers, ownerAccounts } from "@/lib/db/schema";
import { normalizeLegacyRole, type MemberRole } from "@/lib/auth/roles";

export interface AccountListEntry {
  id: string;
  name: string;
  type: "personal" | "team";
  role: MemberRole;
  planId: string;
}

/**
 * Return every owner_account the user is a member of — Personal first,
 * then teams alphabetically. Used by the account switcher and any API
 * that needs to enumerate accounts without N+1 queries.
 */
export async function listAccountsForUser(
  userId: string,
): Promise<AccountListEntry[]> {
  const rows = await db
    .select({
      id: ownerAccounts.id,
      name: ownerAccounts.name,
      type: ownerAccounts.type,
      role: ownerAccountMembers.role,
      planId: ownerAccounts.planId,
    })
    .from(ownerAccountMembers)
    .innerJoin(
      ownerAccounts,
      eq(ownerAccountMembers.ownerAccountId, ownerAccounts.id),
    )
    .where(eq(ownerAccountMembers.userId, userId))
    .orderBy(asc(ownerAccounts.name));

  return rows
    .map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      role: normalizeLegacyRole(r.role),
      planId: r.planId,
    }))
    .sort((a, b) => {
      // Personal before team, alphabetical within each group.
      if (a.type !== b.type) return a.type === "personal" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}
