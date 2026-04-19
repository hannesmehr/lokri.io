/**
 * SSO-Helper-Bibliothek für Team-basiertes Entra-ID-Sign-In.
 *
 * DB-seitige Funktionen + Re-Exports der reinen Validierungs-Helpers
 * aus `sso-validation.ts`. Call-Sites importieren nur `@/lib/auth/sso`
 * und bekommen beides durchgereicht.
 *
 * Siehe `docs/sso-overview-plan.md` für den Kontext.
 */

import { and, eq, gt, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  accounts as authAccounts,
  ownerAccountMembers,
  teamSsoConfigs,
  userSsoIdentities,
  verifications,
} from "@/lib/db/schema";

// Re-Exports — Call-Sites sehen nur `@/lib/auth/sso`.
export {
  decodeIdTokenClaims,
  domainMatchesTeamConfig,
  extractEmailDomain,
  extractEntraClaims,
  validateSsoTokenClaims,
  type EntraClaims,
  type SsoErrorCode,
  type SsoProvider,
} from "./sso-validation";

// ---------------------------------------------------------------------------
// DB-Funktionen
// ---------------------------------------------------------------------------

import { extractEmailDomain } from "./sso-validation";
import type { SsoProvider } from "./sso-validation";

export interface TeamSsoMatch {
  ownerAccountId: string;
  provider: SsoProvider;
  tenantId: string;
  allowedDomains: string[];
}

/**
 * Matcht eine Email gegen alle aktiven Team-SSO-Configs. Gibt den
 * ersten Treffer zurück oder `null`. In Phase 1 ist „ein Treffer
 * genügt" ok, weil ein User selten in mehreren SSO-Teams derselben
 * Domain sein wird; ab Phase 2 muss der User ggf. auswählen.
 */
export async function findSsoTeamForEmail(
  email: string,
): Promise<TeamSsoMatch | null> {
  const domain = extractEmailDomain(email);
  if (!domain) return null;
  const rows = await db
    .select({
      ownerAccountId: teamSsoConfigs.ownerAccountId,
      provider: teamSsoConfigs.provider,
      tenantId: teamSsoConfigs.tenantId,
      allowedDomains: teamSsoConfigs.allowedDomains,
      enabled: teamSsoConfigs.enabled,
    })
    .from(teamSsoConfigs)
    .where(eq(teamSsoConfigs.enabled, true));
  for (const row of rows) {
    if (row.allowedDomains.map((d) => d.toLowerCase()).includes(domain)) {
      return {
        ownerAccountId: row.ownerAccountId,
        provider: row.provider,
        tenantId: row.tenantId,
        allowedDomains: row.allowedDomains,
      };
    }
  }
  return null;
}

/**
 * Ist der gegebene User Mitglied des Teams? Nutzt die bestehende
 * `owner_account_members`-Tabelle, ignoriert Legacy-Rollen nicht —
 * für die Membership-Prüfung reicht „Row existiert".
 */
export async function isUserTeamMember(
  userId: string,
  ownerAccountId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: ownerAccountMembers.id })
    .from(ownerAccountMembers)
    .where(
      and(
        eq(ownerAccountMembers.userId, userId),
        eq(ownerAccountMembers.ownerAccountId, ownerAccountId),
      ),
    )
    .limit(1);
  return !!row;
}

/**
 * Fallback-Admin-Check: Hat das Team mindestens einen Owner oder
 * Admin, der nicht auf SSO angewiesen ist (also einen Credential-
 * Account in Better-Auth mit Passwort)?
 *
 * Phase 1 nutzt die Funktion nur für Tests + Logs + CLI-Guards. In
 * Phase 2 wird sie vom Admin-UI aufgerufen, bevor `enabled=true`
 * gesetzt werden darf.
 */
export async function hasFallbackAdmin(
  ownerAccountId: string,
): Promise<boolean> {
  const memberRoles = ["owner", "admin"] as const;
  const members = await db
    .select({ userId: ownerAccountMembers.userId })
    .from(ownerAccountMembers)
    .where(
      and(
        eq(ownerAccountMembers.ownerAccountId, ownerAccountId),
        or(
          eq(ownerAccountMembers.role, memberRoles[0]),
          eq(ownerAccountMembers.role, memberRoles[1]),
        ),
      ),
    );
  if (members.length === 0) return false;
  const userIds = members.map((m) => m.userId);
  const candidates = await db
    .select({ userId: authAccounts.userId })
    .from(authAccounts)
    .where(
      and(
        inArray(authAccounts.userId, userIds),
        eq(authAccounts.providerId, "credential"),
      ),
    );
  return candidates.length > 0;
}

// ---------------------------------------------------------------------------
// JIT-Account-Linking
// ---------------------------------------------------------------------------

export interface UpsertIdentityInput {
  userId: string;
  provider: SsoProvider;
  tenantId: string;
  subject: string;
}

/**
 * Legt den `user_sso_identities`-Eintrag an, falls er fehlt —
 * sonst bumpt `last_login` auf jetzt. Race-Bedingung zwischen zwei
 * simultanen Callbacks ist durch den Unique-Index
 * `user_sso_identities_user_provider_tenant_unique_idx` abgedeckt.
 *
 * Wirft `SsoIdentityConflictError`, wenn der (provider, tenantId,
 * subject)-Tripel schon einem anderen User gehört — wir melden das
 * als `sso.configurationError`, ohne zu leaken, welcher User.
 */
export async function upsertSsoIdentity(
  input: UpsertIdentityInput,
): Promise<{ created: boolean }> {
  const now = new Date();
  const [existing] = await db
    .select({ id: userSsoIdentities.id, userId: userSsoIdentities.userId })
    .from(userSsoIdentities)
    .where(
      and(
        eq(userSsoIdentities.provider, input.provider),
        eq(userSsoIdentities.tenantId, input.tenantId),
        eq(userSsoIdentities.subject, input.subject),
      ),
    )
    .limit(1);

  if (existing) {
    if (existing.userId !== input.userId) {
      throw new SsoIdentityConflictError();
    }
    await db
      .update(userSsoIdentities)
      .set({ lastLogin: now })
      .where(eq(userSsoIdentities.id, existing.id));
    return { created: false };
  }

  await db.insert(userSsoIdentities).values({
    userId: input.userId,
    provider: input.provider,
    tenantId: input.tenantId,
    subject: input.subject,
    linkedAt: now,
    lastLogin: now,
  });
  return { created: true };
}

export class SsoIdentityConflictError extends Error {
  constructor() {
    super("SSO identity already linked to a different user");
    this.name = "SsoIdentityConflictError";
  }
}

// ---------------------------------------------------------------------------
// State-Store (PKCE-State + Team-Context)
//
// Nutzt die bestehende `verifications`-Tabelle (sonst für Reset-Tokens
// genutzt) und scopet Einträge mit dem Identifier-Prefix `sso-state:`.
// ---------------------------------------------------------------------------

export interface SsoStatePayload {
  codeVerifier: string;
  nonce: string;
  ownerAccountId: string;
  redirectAfter: string;
}

const SSO_STATE_PREFIX = "sso-state:";
const SSO_STATE_TTL_SECONDS = 10 * 60;

export async function persistSsoState(
  state: string,
  payload: SsoStatePayload,
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SSO_STATE_TTL_SECONDS * 1000);
  await db.insert(verifications).values({
    id: crypto.randomUUID(),
    identifier: `${SSO_STATE_PREFIX}${state}`,
    value: JSON.stringify(payload),
    expiresAt,
    createdAt: now,
    updatedAt: now,
  });
}

export async function consumeSsoState(
  state: string,
): Promise<SsoStatePayload | null> {
  const identifier = `${SSO_STATE_PREFIX}${state}`;
  const [row] = await db
    .select({
      id: verifications.id,
      value: verifications.value,
      expiresAt: verifications.expiresAt,
    })
    .from(verifications)
    .where(
      and(
        eq(verifications.identifier, identifier),
        gt(verifications.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!row) {
    // Row kann abgelaufen sein — räum trotzdem auf.
    await db
      .delete(verifications)
      .where(eq(verifications.identifier, identifier));
    return null;
  }
  await db.delete(verifications).where(eq(verifications.id, row.id));
  try {
    return JSON.parse(row.value) as SsoStatePayload;
  } catch {
    return null;
  }
}
