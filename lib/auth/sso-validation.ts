/**
 * Reine, DB-freie SSO-Validierungs-Logik.
 *
 * Lebt in einer eigenen Datei (nicht in `lib/auth/sso.ts`), damit
 * die Contract-Tests in `tests/sso-validation.test.ts` die Funktionen
 * importieren können, ohne den DB-Client zu initialisieren. Der DB-
 * seitige Code in `sso.ts` re-exportiert die Typen + Funktionen von
 * hier, damit Call-Sites weiterhin nur `lib/auth/sso` importieren.
 *
 * Siehe `docs/sso-overview-plan.md` für den Kontext.
 */

// ---------------------------------------------------------------------------
// Error-Codes — 1:1 mit `errors.api.sso.*` im i18n-Katalog
// ---------------------------------------------------------------------------

export type SsoErrorCode =
  | "sso.userNotInvited"
  | "sso.notTeamMember"
  | "sso.tenantMismatch"
  | "sso.domainNotAllowed"
  | "sso.providerUnreachable"
  | "sso.configurationError"
  | "sso.stateInvalid"
  | "sso.fallbackAdminRequired";

export type SsoProvider = "entra";

// ---------------------------------------------------------------------------
// Email-Domain-Matching
// ---------------------------------------------------------------------------

/**
 * Extrahiert die Domain aus einer Email-Adresse (alles nach `@`,
 * lowercase-normalisiert). Gibt `null` bei invalidem Format zurück.
 *
 * Whitespace + Casing werden absichtlich normalisiert, damit das
 * Domain-Matching stabil gegen Copy-Paste-Noise ist. Der Rest der
 * Email (local-part) bleibt unberührt — der ist Sache des IdP.
 */
export function extractEmailDomain(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  // Innenliegender Whitespace macht die Email ungültig — RFC-konform
  // wären zwar quoted-local-parts denkbar, aber für unsere Zwecke
  // (Team-SSO-Domain-Match) ist das Müll.
  if (/\s/.test(trimmed)) return null;
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return null;
  const domain = trimmed.slice(at + 1);
  // RFC-5321-minimal: mindestens ein Punkt, keine Leerzeichen,
  // keine unzulässigen Zeichen. Kein voller RFC-Checker — nur
  // genug, um Müll rauszufiltern.
  if (!/^[a-z0-9.-]+\.[a-z0-9-]+$/.test(domain)) return null;
  return domain;
}

/**
 * Prüft, ob eine Email-Domain in der erlaubten Liste eines Teams
 * vorkommt. Exakt-Match gegen `allowedDomains` (case-insensitive).
 * Subdomain-Matching macht die Config-UI später optional.
 */
export function domainMatchesTeamConfig(
  email: string,
  allowedDomains: readonly string[],
): boolean {
  const domain = extractEmailDomain(email);
  if (!domain) return false;
  const normalised = allowedDomains.map((d) => d.trim().toLowerCase());
  return normalised.includes(domain);
}

// ---------------------------------------------------------------------------
// Token-Claim-Validierung (Tenant-ID, Domain, enabled-Flag)
// ---------------------------------------------------------------------------

/**
 * Validiert den Kontext des Callback-Rückwegs:
 *   - Tenant-ID aus ID-Token muss zur Team-Config passen
 *   - Email-Domain muss in `allowedDomains`
 *   - Team-Config muss `enabled`
 *
 * Gibt `null` bei Erfolg zurück oder den konkreten Error-Code, den
 * die Route in eine Redirect-Fehlermeldung übersetzt.
 *
 * Priorität: `enabled` → `tenantId` → `domain`. Die Reihenfolge ist
 * bewusst — disabled wird immer zuerst gemeldet (Admin-facing),
 * tenant-mismatch vor domain (Identity-Mismatch ist "harter"
 * Security-Error, Domain ist Konfigurations-Detail).
 */
export function validateSsoTokenClaims(args: {
  tokenTid: string;
  tokenEmail: string;
  config: {
    tenantId: string;
    allowedDomains: readonly string[];
    enabled: boolean;
  };
}): SsoErrorCode | null {
  if (!args.config.enabled) return "sso.configurationError";
  if (args.tokenTid !== args.config.tenantId) return "sso.tenantMismatch";
  if (!domainMatchesTeamConfig(args.tokenEmail, args.config.allowedDomains)) {
    return "sso.domainNotAllowed";
  }
  return null;
}

// ---------------------------------------------------------------------------
// JWT-Claim-Parsing (Base64URL-decode, KEINE Signatur-Validation)
// ---------------------------------------------------------------------------

export interface EntraClaims {
  /** `oid` (Object-ID, bevorzugt) oder `sub` als stabile Subject-ID. */
  subject: string;
  /** `tid` — Tenant-ID des authentifizierten Users. */
  tenantId: string;
  /** `email` oder `preferred_username` (Entra setzt eines der beiden). */
  email: string;
}

/**
 * Dekodiert ein JWT-Payload (Base64URL-encoded JSON in der Mitte)
 * ohne Signatur-Verifikation. NICHT direkt in Business-Code nutzen
 * — immer zuerst `microsoft.verifyIdToken()` oder äquivalent, das
 * die Signatur gegen Entra's öffentliche Keys prüft.
 *
 * Export für Tests, die das Parsing mit handgebauten Tokens
 * verifizieren.
 */
export function decodeIdTokenClaims(
  idToken: string,
): Record<string, unknown> | null {
  const parts = idToken.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1];
    // Base64URL → Base64 → Buffer → JSON
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const decoded = Buffer.from(padded, "base64").toString("utf-8");
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function extractEntraClaims(idToken: string): EntraClaims | null {
  const payload = decodeIdTokenClaims(idToken);
  if (!payload) return null;
  const oid = typeof payload.oid === "string" ? payload.oid : null;
  const sub = typeof payload.sub === "string" ? payload.sub : null;
  const subject = oid ?? sub;
  const tid = typeof payload.tid === "string" ? payload.tid : null;
  const email =
    typeof payload.email === "string"
      ? payload.email
      : typeof payload.preferred_username === "string"
        ? payload.preferred_username
        : null;
  if (!subject || !tid || !email) return null;
  return { subject, tenantId: tid, email };
}
