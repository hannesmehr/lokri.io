import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, isNull, sql } from "drizzle-orm";
import { logAuditEvent } from "@/lib/audit/log";
import { db } from "@/lib/db";
import {
  ownerAccountMembers,
  ownerAccounts,
  teamInvites,
  users,
} from "@/lib/db/schema";
import { type Locale } from "@/lib/i18n/config";
import { localeForUserId } from "@/lib/i18n/user-locale";
import { sendMail } from "@/lib/mailer";
import { teamInviteTemplate } from "@/lib/mailer/templates";
import { resolveAppOrigin } from "@/lib/origin";
import { InviteError } from "./errors";

/**
 * Team-invite lifecycle: create → send email → accept / revoke.
 *
 * Token format: `inv_` + 32 random Base64URL bytes. The raw token only
 * ever lives in the email body; what we persist is the bcrypt hash, the
 * same pattern as `api_tokens`. Accept flow iterates pending rows and
 * `bcrypt.compare` — same cost profile as legacy bearer-token auth.
 */

const TOKEN_PREFIX = "inv_";
const TOKEN_BYTES = 32;
const BCRYPT_ROUNDS = 12;
const DEFAULT_EXPIRY_DAYS = 7;

const ALLOWED_INVITE_ROLES = new Set(["admin", "member", "viewer"] as const);
type InviteRole = "admin" | "member" | "viewer";

interface GeneratedInviteToken {
  raw: string; // only returned in-memory; never logged, never stored
  hash: string;
}

async function generateInviteToken(): Promise<GeneratedInviteToken> {
  const raw = `${TOKEN_PREFIX}${randomBytes(TOKEN_BYTES).toString("base64url")}`;
  const hash = await bcrypt.hash(raw, BCRYPT_ROUNDS);
  return { raw, hash };
}

// ---------------------------------------------------------------------------
// createInvite
// ---------------------------------------------------------------------------

export interface CreateInviteInput {
  ownerAccountId: string;
  /** User performing the action. The route has already checked their role. */
  actorUserId: string;
  email: string;
  role: string; // validated against ALLOWED_INVITE_ROLES below
}

export interface CreateInviteResult {
  inviteId: string;
  email: string;
  role: InviteRole;
  expiresAt: Date;
}

export async function createInvite(
  input: CreateInviteInput,
): Promise<CreateInviteResult> {
  if (!ALLOWED_INVITE_ROLES.has(input.role as InviteRole)) {
    throw new InviteError("INVALID_ROLE");
  }
  const role = input.role as InviteRole;
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new InviteError("INVALID_ROLE", "Invalid email");
  }

  // Existing member? Join via `users.email` since invites are email-bound.
  const [existingMember] = await db
    .select({ id: ownerAccountMembers.id })
    .from(ownerAccountMembers)
    .innerJoin(users, eq(users.id, ownerAccountMembers.userId))
    .where(
      and(
        eq(ownerAccountMembers.ownerAccountId, input.ownerAccountId),
        eq(users.email, email),
      ),
    )
    .limit(1);
  if (existingMember) throw new InviteError("ALREADY_MEMBER");

  // Active pending invite for (team, email)? The partial unique index on
  // `team_invites` would also catch this, but surfacing it as a clean
  // error (instead of a 500 from the DB) keeps the UX tidy.
  const [pending] = await db
    .select({ id: teamInvites.id })
    .from(teamInvites)
    .where(
      and(
        eq(teamInvites.ownerAccountId, input.ownerAccountId),
        eq(teamInvites.email, email),
        isNull(teamInvites.acceptedAt),
        isNull(teamInvites.revokedAt),
      ),
    )
    .limit(1);
  if (pending) throw new InviteError("ALREADY_INVITED");

  // Team name + inviter identity for the email.
  const [team] = await db
    .select({ id: ownerAccounts.id, name: ownerAccounts.name })
    .from(ownerAccounts)
    .where(eq(ownerAccounts.id, input.ownerAccountId))
    .limit(1);
  if (!team) throw new InviteError("INVALID_ROLE", "Team not found");

  const [inviter] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, input.actorUserId))
    .limit(1);

  const { raw, hash } = await generateInviteToken();
  const expiresAt = new Date(Date.now() + DEFAULT_EXPIRY_DAYS * 86_400_000);

  const [inserted] = await db
    .insert(teamInvites)
    .values({
      ownerAccountId: input.ownerAccountId,
      email,
      role,
      tokenHash: hash,
      invitedByUserId: input.actorUserId,
      expiresAt,
    })
    .returning({ id: teamInvites.id });

  // Locale: we mail the invitee, but the invitee is (typically) not yet a
  // user. Fall back to the inviter's locale — they chose who to add and
  // know what language the recipient reads.
  const locale: Locale = await localeForUserId(input.actorUserId);
  const acceptUrl = `${resolveAppOrigin()}/invites/accept?token=${encodeURIComponent(raw)}`;
  const inviterName = inviter?.name?.trim() || inviter?.email || "lokri.io";

  // Translated role label for the email. Roles are small so the enum
  // map is cheap and avoids pulling in full message JSON here.
  const roleLabel: Record<Locale, Record<InviteRole, string>> = {
    de: { admin: "Admin", member: "Mitglied", viewer: "Viewer" },
    en: { admin: "Admin", member: "Member", viewer: "Viewer" },
  };

  const tpl = await teamInviteTemplate({
    teamName: team.name,
    inviterName,
    role: roleLabel[locale][role],
    acceptUrl,
    expiresAt,
    locale,
  });
  await sendMail({ to: email, ...tpl });

  await logAuditEvent({
    ownerAccountId: input.ownerAccountId,
    actorUserId: input.actorUserId,
    action: "member.invited",
    targetType: "invite",
    targetId: inserted.id,
    metadata: { email, role },
  });

  return {
    inviteId: inserted.id,
    email,
    role,
    expiresAt,
  };
}

// ---------------------------------------------------------------------------
// acceptInvite
// ---------------------------------------------------------------------------

export interface AcceptInviteInput {
  /** Raw `inv_…` token from the URL. */
  rawToken: string;
  /** Logged-in user accepting the invite. */
  userId: string;
}

export interface AcceptInviteResult {
  ownerAccountId: string;
  role: InviteRole;
  teamName: string;
}

export async function acceptInvite(
  input: AcceptInviteInput,
): Promise<AcceptInviteResult> {
  if (!input.rawToken.startsWith(TOKEN_PREFIX)) {
    throw new InviteError("INVALID_TOKEN");
  }

  // All currently-open invites. We bcrypt-compare against each because
  // `token_hash` is deterministic per raw token — no way to shortcut-index.
  // In practice the pending-invite table stays small (tens of rows per
  // account); iterating is fine.
  const candidates = await db
    .select({
      id: teamInvites.id,
      ownerAccountId: teamInvites.ownerAccountId,
      email: teamInvites.email,
      role: teamInvites.role,
      tokenHash: teamInvites.tokenHash,
      expiresAt: teamInvites.expiresAt,
      invitedByUserId: teamInvites.invitedByUserId,
    })
    .from(teamInvites)
    .where(
      and(isNull(teamInvites.acceptedAt), isNull(teamInvites.revokedAt)),
    );

  let matched:
    | (typeof candidates)[number]
    | undefined;
  for (const row of candidates) {
    if (await bcrypt.compare(input.rawToken, row.tokenHash)) {
      matched = row;
      break;
    }
  }
  if (!matched) throw new InviteError("INVALID_TOKEN");
  if (matched.expiresAt.getTime() < Date.now()) {
    throw new InviteError("EXPIRED");
  }

  // Email-binding check: the accepting user's email must equal what was
  // invited (case-insensitive). Defence against someone forwarding a
  // link to a different person.
  const [acceptingUser] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);
  if (!acceptingUser) throw new InviteError("INVALID_TOKEN");
  if (acceptingUser.email.trim().toLowerCase() !== matched.email) {
    throw new InviteError("EMAIL_MISMATCH");
  }

  // Idempotency: if the user is already a member (perhaps a second invite
  // slipped through), return cleanly.
  const [existing] = await db
    .select({ id: ownerAccountMembers.id })
    .from(ownerAccountMembers)
    .where(
      and(
        eq(ownerAccountMembers.ownerAccountId, matched.ownerAccountId),
        eq(ownerAccountMembers.userId, input.userId),
      ),
    )
    .limit(1);
  if (existing) {
    // Mark the invite as accepted anyway so it disappears from pending.
    await db
      .update(teamInvites)
      .set({ acceptedAt: new Date() })
      .where(eq(teamInvites.id, matched.id));
    throw new InviteError("ALREADY_MEMBER");
  }

  const [team] = await db
    .select({ name: ownerAccounts.name })
    .from(ownerAccounts)
    .where(eq(ownerAccounts.id, matched.ownerAccountId))
    .limit(1);

  await db.transaction(async (tx) => {
    await tx.insert(ownerAccountMembers).values({
      ownerAccountId: matched.ownerAccountId,
      userId: input.userId,
      role: matched.role,
      invitedByUserId: matched.invitedByUserId,
    });
    await tx
      .update(teamInvites)
      .set({ acceptedAt: new Date() })
      .where(eq(teamInvites.id, matched.id));
    await tx
      .update(users)
      .set({ activeOwnerAccountId: matched.ownerAccountId })
      .where(eq(users.id, input.userId));
  });

  await logAuditEvent({
    ownerAccountId: matched.ownerAccountId,
    actorUserId: input.userId,
    action: "member.joined",
    targetType: "user",
    targetId: input.userId,
    metadata: { inviteId: matched.id, role: matched.role },
  });

  return {
    ownerAccountId: matched.ownerAccountId,
    role: matched.role as InviteRole,
    teamName: team?.name ?? "",
  };
}

// ---------------------------------------------------------------------------
// revokeInvite
// ---------------------------------------------------------------------------

export interface RevokeInviteInput {
  inviteId: string;
  ownerAccountId: string; // cross-check so a user can't revoke another team's invite
  actorUserId: string;
}

export async function revokeInvite(input: RevokeInviteInput): Promise<void> {
  const result = await db
    .update(teamInvites)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(teamInvites.id, input.inviteId),
        eq(teamInvites.ownerAccountId, input.ownerAccountId),
        isNull(teamInvites.acceptedAt),
        isNull(teamInvites.revokedAt),
      ),
    )
    .returning({ id: teamInvites.id, email: teamInvites.email });
  if (result.length === 0) {
    throw new InviteError("INVALID_TOKEN", "Invite not found or already processed");
  }
  await logAuditEvent({
    ownerAccountId: input.ownerAccountId,
    actorUserId: input.actorUserId,
    action: "member.invite_revoked",
    targetType: "invite",
    targetId: input.inviteId,
    metadata: { email: result[0].email },
  });
}

// ---------------------------------------------------------------------------
// listPendingInvites (for Settings UI)
// ---------------------------------------------------------------------------

export interface PendingInvite {
  id: string;
  email: string;
  role: InviteRole;
  invitedByUserId: string | null;
  invitedByName: string | null;
  expiresAt: Date;
  createdAt: Date;
}

export async function listPendingInvites(
  ownerAccountId: string,
): Promise<PendingInvite[]> {
  const rows = await db
    .select({
      id: teamInvites.id,
      email: teamInvites.email,
      role: teamInvites.role,
      invitedByUserId: teamInvites.invitedByUserId,
      invitedByName: users.name,
      expiresAt: teamInvites.expiresAt,
      createdAt: teamInvites.createdAt,
    })
    .from(teamInvites)
    .leftJoin(users, eq(users.id, teamInvites.invitedByUserId))
    .where(
      and(
        eq(teamInvites.ownerAccountId, ownerAccountId),
        isNull(teamInvites.acceptedAt),
        isNull(teamInvites.revokedAt),
        sql`${teamInvites.expiresAt} > now()`,
      ),
    )
    .orderBy(teamInvites.createdAt);
  return rows.map((r) => ({
    ...r,
    role: r.role as InviteRole,
  }));
}

export { ALLOWED_INVITE_ROLES };
export type { InviteRole };
