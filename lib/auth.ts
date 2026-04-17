import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";
import {
  accounts,
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
if (!process.env.BETTER_AUTH_URL) {
  throw new Error("BETTER_AUTH_URL is not set");
}

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,

  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
    },
  }),

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
