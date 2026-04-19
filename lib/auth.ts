import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { mcp, twoFactor } from "better-auth/plugins";
import { microsoft } from "better-auth/social-providers";
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import {
  accounts,
  files as filesTable,
  oauthAccessToken,
  oauthApplication,
  oauthConsent,
  ownerAccountMembers,
  ownerAccounts,
  sessions,
  twoFactor as twoFactorTable,
  users,
  verifications,
} from "./db/schema";
import { logAuditEvent } from "./audit/log";
import { localeForUserEmail } from "./i18n/user-locale";
import { sendMail } from "./mailer";
import {
  changeEmailTemplate,
  deleteAccountTemplate,
  resetPasswordTemplate,
  verifyEmailTemplate,
} from "./mailer/templates";
import { getProviderForFile } from "./storage";

const FREE_PLAN_ID = "free";

if (!process.env.BETTER_AUTH_SECRET) {
  throw new Error("BETTER_AUTH_SECRET is not set");
}

/**
 * Resolve the canonical base URL for Better-Auth.
 *
 * Precedence:
 *   1. `BETTER_AUTH_URL` — explicit override, used in dev and recommended
 *      for Vercel production (set to your final custom domain).
 *   2. `VERCEL_PROJECT_PRODUCTION_URL` — the project's production host.
 *   3. `VERCEL_URL` — the URL of the current deployment (preview or prod).
 *
 * On Vercel none of these need scheme/path, so we prepend `https://`.
 */
function resolveBaseUrl(): string {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  throw new Error(
    "No base URL for Better-Auth — set BETTER_AUTH_URL or deploy to Vercel.",
  );
}

/**
 * Trusted origins for CSRF checks. Includes the resolved base URL plus the
 * Vercel deployment URL, plus a wildcard for all preview deployments on
 * *.vercel.app.
 */
function resolveTrustedOrigins(): string[] {
  const origins = new Set<string>();
  origins.add(resolveBaseUrl());
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    origins.add(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
  }
  if (process.env.VERCEL_URL) {
    origins.add(`https://${process.env.VERCEL_URL}`);
  }
  // Preview deployments have unpredictable subdomains. This wildcard is safe
  // because Vercel controls the *.vercel.app namespace.
  origins.add("https://*.vercel.app");
  return [...origins];
}

/**
 * Microsoft Entra ID (OIDC) — Team-SSO via Better-Auth's built-in
 * `microsoft` social provider. Opt-in per Env: fehlen beide Secrets,
 * wird der Provider nicht registriert und der App-Boot läuft
 * unverändert (lokale Dev ohne Entra-Setup ist so möglich).
 *
 * Entra-Multi-Tenant-Modus (`tenantId: "common"`): eine App in
 * lokri's Tenant, jeder Kunde hängt sein eigenes Tenant über die
 * `team_sso_configs.tenant_id`-Validierung im Callback an (Block 3).
 * Block 2 wired hier nur den Provider selbst — die Team-Account-
 * Verhandlung und JIT-Linking folgen separat.
 *
 * Scopes minimal: `openid`, `profile`, `email`. Keine Directory-
 * Scopes — wir wollen nur Authentifizierung, kein Graph-Access.
 */
/**
 * Eigener `verifyIdToken` für Entra-Tokens — ersetzt Better-Auth's
 * Built-in, weil der einen Bug hat:
 *
 * `getMicrosoftPublicKey` ruft `importJWK(jwk, jwk.alg)` auf. Entra's
 * `/common/discovery/v2.0/keys`-Endpoint liefert JWKs aber **ohne**
 * `alg`-Feld, `jwk.alg` ist undefined, `jose` wirft
 * `TypeError: "alg" argument is required when "jwk.alg" is not
 * present`. Better-Auth catched → `return false`, unser Callback
 * redirectet generisch mit `sso.tenantMismatch`, der User klickt
 * frustriert.
 *
 * Fix: wir nehmen das `alg`-Feld aus dem **Token-Header** als Fallback
 * (ist OIDC-konform, Entra setzt dort `RS256`). Alles andere ist 1:1
 * die Better-Auth-Logik — signature + audience + maxTokenAge + nonce.
 *
 * Upstream-Fix-Status: gemeldet werden, sobald wir Kapazität haben;
 * bis dahin lebt die Workaround-Implementation hier.
 */
async function verifyEntraIdToken(
  token: string,
  nonce: string | undefined,
  clientId: string,
): Promise<boolean> {
  try {
    const { decodeProtectedHeader, importJWK, jwtVerify } = await import(
      "jose"
    );
    const { kid, alg } = decodeProtectedHeader(token);
    if (!kid || !alg) return false;

    const keysRes = await fetch(
      "https://login.microsoftonline.com/common/discovery/v2.0/keys",
      { headers: { accept: "application/json" } },
    );
    if (!keysRes.ok) return false;
    const keysJson = (await keysRes.json()) as {
      keys?: Array<{ kid?: string; alg?: string } & Record<string, unknown>>;
    };
    const jwk = keysJson.keys?.find((k) => k.kid === kid);
    if (!jwk) return false;

    // Der Fix: `jwk.alg ?? alg` — fällt auf den Token-Header-alg zurück,
    // wenn der JWK kein alg-Feld trägt. `jose` importJWK akzeptiert das.
    const publicKey = await importJWK(jwk, jwk.alg ?? alg);

    const { payload } = await jwtVerify(token, publicKey, {
      algorithms: [alg],
      audience: clientId,
      maxTokenAge: "1h",
    });

    if (nonce && payload.nonce !== nonce) return false;
    return true;
  } catch (err) {
    console.error("[auth.verifyEntraIdToken]", err);
    return false;
  }
}

function resolveMicrosoftSocialProvider() {
  const clientId = process.env.ENTRA_CLIENT_ID;
  const clientSecret = process.env.ENTRA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    if (process.env.NODE_ENV === "production") {
      // In Prod loggen, aber nicht werfen — SSO ist ein optionales
      // Feature; Teams ohne SSO-Config sollen weiter funktionieren.
      console.warn(
        "[auth] ENTRA_CLIENT_ID / ENTRA_CLIENT_SECRET nicht gesetzt — SSO-Provider nicht registriert.",
      );
    }
    return undefined;
  }
  return {
    clientId,
    clientSecret,
    /**
     * `common` ⇒ Multi-Tenant-Endpoint. Der `tid`-Claim im ID-Token
     * wird in Block 3 gegen `team_sso_configs.tenant_id` validiert
     * — der Multi-Tenant-Wert hier sagt nur „akzeptiere Tokens aus
     * jedem Tenant"; die Zugriffskontrolle läuft über unsere
     * Team-Config.
     */
    tenantId: "common",
    scope: ["openid", "profile", "email"] as string[],
    /** Eigener Verify wegen Better-Auth-Bug — siehe `verifyEntraIdToken`
     *  oben für den Grund. */
    verifyIdToken: async (token: string, nonce?: string) =>
      verifyEntraIdToken(token, nonce, clientId),
  };
}

const microsoftProvider = resolveMicrosoftSocialProvider();

/**
 * Öffentliche Provider-Instanz für den SSO-Callback-Wrapper
 * (`app/api/auth/sso/*`). Mit denselben Options, die Better-Auth in
 * `socialProviders.microsoft` registriert — so arbeiten beide Wege
 * (Standard-Sign-In-Social + unser Wrapper) gegen dieselbe Config.
 *
 * `null`, wenn Env-Vars fehlen — die Routes müssen das prüfen und
 * mit `sso.providerUnreachable` reagieren.
 */
export const microsoftSsoProvider = microsoftProvider
  ? microsoft(microsoftProvider)
  : null;

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: resolveBaseUrl(),
  trustedOrigins: resolveTrustedOrigins(),

  /**
   * Social-Provider-Block. Nur `microsoft` registriert, und auch nur,
   * wenn Env-Variablen gesetzt sind — via optional-Chain an der
   * `microsoft`-Key. `socialProviders` selbst bleibt immer im Config,
   * damit TypeScript die Plugin-Type-Inference für `auth.api` nicht
   * zerlegt (ein Conditional-Spread würde `auth.api.getSession` etc.
   * verlieren — Better-Auth Type-Chain ist zickig).
   */
  socialProviders: {
    microsoft: microsoftProvider,
  },

  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
      // Tables added by the `mcp` plugin (OAuth 2.1 / OIDC for MCP clients):
      oauthApplication,
      oauthAccessToken,
      oauthConsent,
      // Added by `twoFactor` plugin.
      twoFactor: twoFactorTable,
    },
  }),


  plugins: [
    // Enables OAuth 2.1 + Dynamic Client Registration so remote MCP clients
    // (Claude Desktop, ChatGPT, Cursor, …) can connect natively, without the
    // `mcp-remote` stdio bridge. Exposes:
    //   /api/auth/.well-known/oauth-authorization-server
    //   /api/auth/.well-known/oauth-protected-resource
    //   /api/auth/mcp/register     (RFC 7591 DCR)
    //   /api/auth/mcp/authorize    (OAuth 2.1 authorize endpoint)
    //   /api/auth/mcp/token        (token endpoint, PKCE required)
    //   /api/auth/oauth2/consent   (consent endpoint)
    //   /api/auth/mcp/get-session  (internal bearer verification)
    //
    // The root-level `/.well-known/*` routes proxy to these via the helper
    // functions in `app/.well-known/*` route handlers.
    mcp({
      loginPage: "/login",
    }),
    // TOTP-based 2FA. Backup-codes + optional OTP channels available; we
    // ship with TOTP only for now (authenticator apps / 1Password etc.).
    twoFactor({
      issuer: "lokri.io",
    }),
  ],

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    /**
     * Public self-service signup is closed for now — Better-Auth's
     * `/sign-up/email` route returns `EMAIL_PASSWORD_SIGN_UP_DISABLED`.
     * Existing users can still sign in, reset passwords, and change emails.
     * Flip back to `false` (or remove the key) when we're ready to open
     * registration again.
     */
    disableSignUp: true,
    // Password-reset: uses Resend via lib/mailer.
    sendResetPassword: async ({ user, url }) => {
      const locale = await localeForUserEmail(user.email);
      const tpl = await resetPasswordTemplate({
        name: user.name ?? null,
        url,
        locale,
      });
      await sendMail({ to: user.email, ...tpl });
    },
    resetPasswordTokenExpiresIn: 60 * 60, // 1 hour
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      const locale = await localeForUserEmail(user.email);
      const tpl = await verifyEmailTemplate({
        name: user.name ?? null,
        url,
        locale,
      });
      await sendMail({ to: user.email, ...tpl });
    },
  },

  user: {
    // Email-Change: Verification-Mail an die NEUE Adresse, erst nach Klick
    // wird umgestellt. Die alte Adresse bleibt gültig bis dahin.
    changeEmail: {
      enabled: true,
      sendChangeEmailVerification: async ({
        user,
        newEmail,
        url,
      }: {
        user: { email: string; name?: string | null };
        newEmail: string;
        url: string;
      }) => {
        const locale = await localeForUserEmail(user.email);
        const tpl = await changeEmailTemplate({
          name: user.name ?? null,
          newEmail,
          url,
          locale,
        });
        await sendMail({ to: newEmail, ...tpl });
      },
    },
    // GDPR Artikel 17 — self-service account deletion. Verification email
    // + best-effort cleanup of owner-scoped resources (handled via
    // beforeDelete below).
    deleteUser: {
      enabled: true,
      sendDeleteAccountVerification: async ({ user, url }) => {
        const locale = await localeForUserEmail(user.email);
        const tpl = await deleteAccountTemplate({
          name: user.name ?? null,
          url,
          locale,
        });
        await sendMail({ to: user.email, ...tpl });
      },
      beforeDelete: async (user) => {
        // Find all personal owner_accounts where this user is the `owner`
        // member. Cleanup cascades from owner_accounts → spaces/notes/files
        // via FK `ON DELETE CASCADE`, but Vercel Blob objects are outside
        // the DB so we wipe them explicitly first.
        const memberships = await db
          .select({ accountId: ownerAccountMembers.ownerAccountId })
          .from(ownerAccountMembers)
          .where(
            and(
              eq(ownerAccountMembers.userId, user.id),
              eq(ownerAccountMembers.role, "owner"),
            ),
          );

        for (const m of memberships) {
          const fileRows = await db
            .select({
              id: filesTable.id,
              storageKey: filesTable.storageKey,
              storageProviderId: filesTable.storageProviderId,
            })
            .from(filesTable)
            .where(eq(filesTable.ownerAccountId, m.accountId));
          if (fileRows.length === 0) continue;
          await Promise.all(
            fileRows.map(async (f) => {
              try {
                const provider = await getProviderForFile(
                  f.storageProviderId,
                  m.accountId,
                );
                await provider.delete(f.storageKey);
              } catch (err) {
                console.error(
                  `[auth.deleteUser] Blob delete failed for ${f.id}:`,
                  err,
                );
              }
            }),
          );
        }

        // Delete owner_accounts this user owns alone. Cascades to spaces,
        // notes, files, api_tokens, usage_quota, owner_account_members.
        // (Team scenarios in V2 will need role re-assignment first; MVP
        // is strictly personal so every owner_account has exactly one
        // owner member.)
        for (const m of memberships) {
          await db.delete(ownerAccounts).where(eq(ownerAccounts.id, m.accountId));
        }
      },
    },
  },

  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
  },

  /**
   * Database-level hooks. Two wire-in points:
   *
   *   1. `user.create.after` — auto-provision a personal owner_account
   *      + membership row on signup. Best-effort: if this hiccups, the
   *      helper `getOrCreateOwnerAccountForUser` self-heals on the
   *      user's next API call.
   *   2. `session.create.after` — fires on every successful sign-in
   *      (password + 2FA, OAuth callback, refresh). We write a
   *      `login.success` audit event against the user's personal
   *      owner_account. Scope is intentionally personal: a login is
   *      an identity event, not a business operation on whatever
   *      team the user happens to have active.
   *
   * `login.failed` is *not* wired — Better-Auth doesn't expose a
   * pre-failure hook. Documented as a known limitation in
   * `docs/OPS.md`; revisit when the upstream grows one.
   */
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          try {
            const [ownerAccount] = await db
              .insert(ownerAccounts)
              .values({
                type: "personal",
                name: user.name ?? user.email,
                planId: FREE_PLAN_ID,
              })
              .returning({ id: ownerAccounts.id });

            if (ownerAccount) {
              await db.insert(ownerAccountMembers).values({
                ownerAccountId: ownerAccount.id,
                userId: user.id,
                role: "owner",
              });
            }
          } catch (err) {
            console.error(
              `[auth.user.create.after] Failed to provision owner_account for user ${user.id}:`,
              err,
            );
          }
        },
      },
    },
    session: {
      create: {
        after: async (session) => {
          try {
            const userId = session.userId;
            if (!userId) return;
            const [row] = await db
              .select({ id: ownerAccounts.id })
              .from(ownerAccountMembers)
              .innerJoin(
                ownerAccounts,
                eq(ownerAccountMembers.ownerAccountId, ownerAccounts.id),
              )
              .where(
                and(
                  eq(ownerAccountMembers.userId, userId),
                  eq(ownerAccounts.type, "personal"),
                  eq(ownerAccountMembers.role, "owner"),
                ),
              )
              .limit(1);
            if (!row) return; // personal account not yet provisioned
            await logAuditEvent({
              ownerAccountId: row.id,
              actorUserId: userId,
              action: "login.success",
              targetType: "user",
              targetId: userId,
              ipAddress: session.ipAddress ?? null,
              userAgent: session.userAgent ?? null,
              metadata: { sessionId: session.id },
            });
          } catch (err) {
            // Never surface — login must not fail because auditing hiccuped.
            console.error("[auth.session.create.after]", err);
          }
        },
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
