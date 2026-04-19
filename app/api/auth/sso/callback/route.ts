import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { auth, microsoftSsoProvider } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit/log";
import {
  consumeSsoState,
  extractEntraClaims,
  isUserTeamMember,
  SsoIdentityConflictError,
  upsertSsoIdentity,
  validateSsoTokenClaims,
  type SsoErrorCode,
} from "@/lib/auth/sso";
import { db } from "@/lib/db";
import { teamSsoConfigs, users } from "@/lib/db/schema";

export const runtime = "nodejs";

/**
 * SSO-Callback-Wrapper — eigene Route statt Better-Auth's Standard-
 * `/api/auth/callback/:provider`. Warum:
 *
 *   1. Single Source of Truth für die Validierungs-Kette
 *      (Tenant-ID → Email-Domain → User-Exists → Team-Member →
 *      JIT-Link). Hooks auf Better-Auth-Seite würden die Logik auf
 *      User-Create-Pfad UND Existing-User-Pfad aufteilen.
 *   2. Error-UX kontrollierbar — generische Hook-Exceptions würden
 *      beim User als "Something went wrong" landen; wir redirecten
 *      mit konkretem `error=sso.xxx`-Code auf `/login`, den die
 *      Login-Page übersetzt.
 *   3. Skaliert für Google Workspace in Phase 4: neuer Provider,
 *      dieselbe Validierungs-Funktion.
 *
 * Better-Auth-Conventions, die wir bewusst umgehen:
 *   - Kein `/api/auth/callback/microsoft` (Standard-Pfad bleibt
 *     existent, falls irgendwer Better-Auth's `sign-in/social`
 *     direkt aufruft — aber wir steuern Team-SSO über `/sso/*`).
 *   - Kein `state`-Cookie (Better-Auth managed das üblicherweise
 *     per Cookie). Unser State lebt in der `verifications`-Tabelle
 *     via `lib/auth/sso.ts::persistSsoState`.
 *
 * Provider-Methoden aus Better-Auth (bei Lib-Updates prüfen):
 *   - `microsoftSsoProvider.validateAuthorizationCode({...})`
 *   - `microsoftSsoProvider.verifyIdToken(token, nonce)`
 *
 * Session-Erzeugung: `auth.api.signInSocial({ idToken: { token,
 * nonce } })` akzeptiert ein vor-validiertes OIDC-Token und mintet
 * die Session inkl. Cookie. Das ist **die** öffentliche API, die
 * Better-Auth für Native-Mobile-Flows und unseren Use-Case anbietet
 * — kein Zugriff auf Internal-Adapter nötig.
 */

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const idpError = url.searchParams.get("error");

  if (idpError) {
    // Entra hat selbst schon Nein gesagt (Consent verweigert,
    // MFA-Fehler, etc.). Wir reichen generisch weiter.
    console.warn("[sso.callback] IdP error:", idpError);
    return redirectError(req, "sso.providerUnreachable");
  }

  if (!state || !code) {
    return redirectError(req, "sso.stateInvalid");
  }

  if (!microsoftSsoProvider) {
    return redirectError(req, "sso.providerUnreachable");
  }

  // State einlösen (one-time-use). Danach haben wir codeVerifier +
  // ownerAccountId + nonce + redirectAfter.
  const statePayload = await consumeSsoState(state);
  if (!statePayload) {
    return redirectError(req, "sso.stateInvalid");
  }

  // Team-Config laden.
  const [config] = await db
    .select({
      ownerAccountId: teamSsoConfigs.ownerAccountId,
      provider: teamSsoConfigs.provider,
      tenantId: teamSsoConfigs.tenantId,
      allowedDomains: teamSsoConfigs.allowedDomains,
      enabled: teamSsoConfigs.enabled,
    })
    .from(teamSsoConfigs)
    .where(eq(teamSsoConfigs.ownerAccountId, statePayload.ownerAccountId))
    .limit(1);

  if (!config) {
    return redirectError(req, "sso.configurationError");
  }

  const redirectURI = `${url.origin}/api/auth/sso/callback`;

  // Token-Exchange.
  let tokens: Awaited<
    ReturnType<typeof microsoftSsoProvider.validateAuthorizationCode>
  >;
  try {
    tokens = await microsoftSsoProvider.validateAuthorizationCode({
      code,
      codeVerifier: statePayload.codeVerifier,
      redirectURI,
    });
  } catch (err) {
    console.error("[sso.callback] token-exchange failed:", err);
    return redirectError(req, "sso.providerUnreachable");
  }

  const idToken = tokens.idToken;
  if (!idToken) {
    return redirectError(req, "sso.providerUnreachable");
  }

  // ID-Token Signatur-Validierung gegen Entra's public keys.
  // Besteht der Check, ist der Token authentisch und nicht
  // gefälscht.
  try {
    const ok = await microsoftSsoProvider.verifyIdToken(
      idToken,
      statePayload.nonce,
    );
    if (!ok) return redirectError(req, "sso.tenantMismatch");
  } catch (err) {
    console.error("[sso.callback] verifyIdToken failed:", err);
    return redirectError(req, "sso.providerUnreachable");
  }

  // Claims extrahieren.
  const claims = extractEntraClaims(idToken);
  if (!claims) {
    return redirectError(req, "sso.providerUnreachable");
  }

  // Business-Validation: Tenant + Domain + enabled-Flag.
  const validationError = validateSsoTokenClaims({
    tokenTid: claims.tenantId,
    tokenEmail: claims.email,
    config,
  });
  if (validationError) {
    await logFailedLogin({
      ownerAccountId: config.ownerAccountId,
      tenantId: claims.tenantId,
      reason: validationError,
    });
    return redirectError(req, validationError);
  }

  // User-Lookup per Email. User MUSS existieren — kein
  // Auto-Provisioning (docs/sso-overview-plan.md §2).
  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, claims.email.toLowerCase()))
    .limit(1);

  if (!user) {
    await logFailedLogin({
      ownerAccountId: config.ownerAccountId,
      tenantId: claims.tenantId,
      reason: "sso.userNotInvited",
      claimEmail: claims.email,
    });
    return redirectError(req, "sso.userNotInvited");
  }

  // Team-Membership-Check.
  const isMember = await isUserTeamMember(user.id, config.ownerAccountId);
  if (!isMember) {
    await logFailedLogin({
      ownerAccountId: config.ownerAccountId,
      tenantId: claims.tenantId,
      userId: user.id,
      reason: "sso.notTeamMember",
    });
    return redirectError(req, "sso.notTeamMember");
  }

  // JIT-Link in `user_sso_identities`.
  try {
    await upsertSsoIdentity({
      userId: user.id,
      provider: "entra",
      tenantId: claims.tenantId,
      subject: claims.subject,
    });
  } catch (err) {
    if (err instanceof SsoIdentityConflictError) {
      console.error(
        "[sso.callback] identity-conflict for user",
        user.id,
        err.message,
      );
      await logFailedLogin({
        ownerAccountId: config.ownerAccountId,
        tenantId: claims.tenantId,
        userId: user.id,
        reason: "sso.configurationError",
      });
      return redirectError(req, "sso.configurationError");
    }
    throw err;
  }

  // Session minten via Better-Auth. Die API akzeptiert
  // pre-verified OIDC-Tokens und erledigt User-Linking +
  // Session-Cookie.
  const h = await headers();
  let response: Response;
  try {
    const result = await auth.api.signInSocial({
      body: {
        provider: "microsoft",
        idToken: {
          token: idToken,
          nonce: statePayload.nonce,
          // Hint-User, damit Better-Auth ohne getUserInfo-Roundtrip
          // auskommt.
          user: {
            email: claims.email.toLowerCase(),
          },
        },
        callbackURL: statePayload.redirectAfter,
      },
      headers: h,
      asResponse: true,
    });
    response = result;
  } catch (err) {
    console.error("[sso.callback] signInSocial failed:", err);
    return redirectError(req, "sso.providerUnreachable");
  }

  // Audit-Event (erfolgreicher Login via SSO).
  await logSuccessLogin({
    ownerAccountId: config.ownerAccountId,
    userId: user.id,
    tenantId: claims.tenantId,
    subject: claims.subject,
  });

  // Better-Auth's Response hat den Session-Cookie schon gesetzt.
  // Wir übernehmen die Set-Cookie-Header und machen einen Redirect
  // zum Ziel.
  const redirectResponse = NextResponse.redirect(
    new URL(statePayload.redirectAfter, req.url).toString(),
    { status: 302 },
  );
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      redirectResponse.headers.append("set-cookie", value);
    }
  });
  return redirectResponse;
}

function redirectError(req: NextRequest, code: SsoErrorCode): NextResponse {
  const url = new URL("/login", req.url);
  url.searchParams.set("error", code);
  return NextResponse.redirect(url.toString(), { status: 302 });
}

// ── Audit-Helpers ────────────────────────────────────────────────────

async function logSuccessLogin(args: {
  ownerAccountId: string;
  userId: string;
  tenantId: string;
  subject: string;
}) {
  try {
    await logAuditEvent({
      ownerAccountId: args.ownerAccountId,
      actorUserId: args.userId,
      action: "login.sso.entra",
      targetType: "user",
      targetId: args.userId,
      metadata: {
        tenantId: args.tenantId,
        // `subject` ist die Entra-Object-ID — kein Token, kein
        // PII, stabile Identifier. Darf ins Audit.
        subject: args.subject,
        success: true,
      },
    });
  } catch (err) {
    console.error("[sso.callback] audit-write failed:", err);
  }
}

async function logFailedLogin(args: {
  ownerAccountId: string;
  tenantId: string;
  userId?: string;
  claimEmail?: string;
  reason: SsoErrorCode;
}) {
  try {
    await logAuditEvent({
      ownerAccountId: args.ownerAccountId,
      actorUserId: args.userId ?? null,
      action: "login.sso.entra",
      targetType: "user",
      targetId: args.userId ?? null,
      metadata: {
        tenantId: args.tenantId,
        success: false,
        failureReason: args.reason,
        // `claimEmail` bewusst nur bei not-invited-Fehlern, damit
        // der Admin im Audit sehen kann, wer sich zu verbinden
        // versuchte. Bei tenant-mismatch nicht — sonst Enumeration.
        claimEmail: args.claimEmail ?? null,
      },
    });
  } catch (err) {
    console.error("[sso.callback] audit-write failed:", err);
  }
}
