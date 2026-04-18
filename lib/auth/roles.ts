/**
 * Role hierarchy + capability helpers for owner_account_members.
 *
 * Modern roles: `owner | admin | member | viewer`. The enum also carries
 * the legacy values `editor` and `reader` (still present in `space_members`
 * rows from before the team refactor) — they are normalised to
 * `member` / `viewer` before any hierarchy check.
 *
 * Rationale for this module (vs. inlining): the same capability questions
 * (canManageMembers, canEditContent, etc.) are asked in three different
 * layers — UI (to show/hide buttons), API route guards, and MCP tool
 * gates. Keeping the truth table in one place means a future role tweak
 * doesn't need cross-file greps.
 */

/** All roles that may appear in the enum column. Order matters: it's the
 *  authoritative hierarchy, index = rank (higher index = more privilege). */
export const MEMBER_ROLES = ["viewer", "member", "admin", "owner"] as const;

export type MemberRole = (typeof MEMBER_ROLES)[number];

/** Legacy → modern alias used in `owner_account_members` but also
 *  referenced from `space_members` rows. */
const LEGACY_ALIASES = {
  editor: "member",
  reader: "viewer",
} as const satisfies Record<string, MemberRole>;

type LegacyRole = keyof typeof LEGACY_ALIASES;

/**
 * Coerce any enum value — modern or legacy — to a canonical `MemberRole`.
 * Unknown strings bubble up as the safest possible assumption (`viewer`)
 * rather than throwing; the caller is presumably doing an authorisation
 * decision and we'd rather err on the side of less access than a 500.
 */
export function normalizeLegacyRole(role: string): MemberRole {
  if ((MEMBER_ROLES as readonly string[]).includes(role)) {
    return role as MemberRole;
  }
  if (role in LEGACY_ALIASES) {
    return LEGACY_ALIASES[role as LegacyRole];
  }
  return "viewer";
}

function rank(role: MemberRole): number {
  return MEMBER_ROLES.indexOf(role);
}

/**
 * True when `actual` is at least as privileged as `required`. Feed both
 * through `normalizeLegacyRole` first if the source is a raw DB string.
 */
export function hasRole(actual: MemberRole, required: MemberRole): boolean {
  return rank(actual) >= rank(required);
}

// ---------------------------------------------------------------------------
// Capability predicates — the single source of truth for "who can do X".
// UI asks these to decide what to render, API guards ask them to decide
// whether to process the request.
// ---------------------------------------------------------------------------

/** Invite, remove, or change roles of members (excluding the owner). */
export function canManageMembers(role: MemberRole): boolean {
  return hasRole(role, "admin");
}

/** Change plan, see invoices, handle billing. Only the owner. */
export function canManageBilling(role: MemberRole): boolean {
  return hasRole(role, "owner");
}

/** Hard-delete the team. Only the owner. */
export function canDeleteTeam(role: MemberRole): boolean {
  return hasRole(role, "owner");
}

/** Create a space inside the team. */
export function canCreateSpace(role: MemberRole): boolean {
  return hasRole(role, "member");
}

/** Create / update / delete notes, files, tokens tied to the acting user. */
export function canEditContent(role: MemberRole): boolean {
  return hasRole(role, "member");
}

/** Personal (user-scoped) MCP tokens — revoked when the member is removed. */
export function canCreatePersonalTokens(role: MemberRole): boolean {
  return hasRole(role, "member");
}

/** Account-scoped MCP tokens — survive member removal, only admins+. */
export function canCreateTeamTokens(role: MemberRole): boolean {
  return hasRole(role, "admin");
}

/** Read the audit log (no UI in V1, but API guards should agree). */
export function canViewAuditLog(role: MemberRole): boolean {
  return hasRole(role, "admin");
}
