import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { mcp } from "better-auth/plugins";
import { db } from "./db";
import {
  accounts,
  oauthAccessToken,
  oauthApplication,
  oauthConsent,
  ownerAccountMembers,
  ownerAccounts,
  sessions,
  users,
  verifications,
} from "./db/schema";

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
  ],

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      // TODO: Swap for a real mailer in V1.1. Keep the log loud so devs notice.
      console.log(
        `\n=== [MAILER STUB] Email verification ===\n` +
          `To:     ${user.email}\n` +
          `Verify: ${url}\n` +
          `========================================\n`,
      );
    },
  },

  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
  },

  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // Auto-provision a personal owner_account + membership on signup.
          // Best-effort: if this fails (e.g. free plan missing), the user row
          // still exists. Reconciliation is handled by
          // `getOrCreateOwnerAccountForUser` in API helpers (Schritt 8).
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
  },
});

export type Session = typeof auth.$Infer.Session;
