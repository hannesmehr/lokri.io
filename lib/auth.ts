import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { mcp, twoFactor } from "better-auth/plugins";
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

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: resolveBaseUrl(),
  trustedOrigins: resolveTrustedOrigins(),

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
