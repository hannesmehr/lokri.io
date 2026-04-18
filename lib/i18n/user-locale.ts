import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { defaultLocale, isLocale, type Locale } from "./config";

/**
 * Resolve a user's preferred locale by email. Falls back to `defaultLocale`
 * when the user isn't known yet (fresh signup) or hasn't picked one.
 *
 * Used by Better-Auth email hooks (`lib/auth.ts`) where we only have
 * `user.email`, not `user.id`. Non-throwing — a DB hiccup silently yields
 * the default.
 */
export async function localeForUserEmail(email: string): Promise<Locale> {
  try {
    const [row] = await db
      .select({ preferred: users.preferredLocale })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (row && isLocale(row.preferred)) return row.preferred;
  } catch {
    // fall through
  }
  return defaultLocale;
}

/** Same thing keyed by user id — cheaper when caller already has it. */
export async function localeForUserId(userId: string): Promise<Locale> {
  try {
    const [row] = await db
      .select({ preferred: users.preferredLocale })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (row && isLocale(row.preferred)) return row.preferred;
  } catch {
    // fall through
  }
  return defaultLocale;
}
