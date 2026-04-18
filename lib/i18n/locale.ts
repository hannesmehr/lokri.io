import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import {
  defaultLocale,
  isLocale,
  locales,
  localeCookieName,
  type Locale,
} from "./config";

/**
 * Server-side locale resolution. Priority order:
 *
 *   1. `users.preferred_locale`   — explicit user choice (once they used
 *                                    the switcher in their profile)
 *   2. `lokri-locale` cookie      — anonymous preference or pre-login pick
 *   3. `Accept-Language` header   — first matching language from `locales`
 *   4. `defaultLocale`            — hard fallback (`de`)
 *
 * `userId` is optional because pre-login pages (landing, login, register,
 * legal) still need a locale but have no session. The function never
 * throws — a DB hiccup silently falls through to header/cookie/default.
 */
export async function resolveLocale(userId?: string | null): Promise<Locale> {
  if (userId) {
    try {
      const [row] = await db
        .select({ preferred: users.preferredLocale })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (row && isLocale(row.preferred)) return row.preferred;
    } catch {
      // DB unavailable — fall through.
    }
  }

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(localeCookieName)?.value;
  if (isLocale(cookieValue)) return cookieValue;

  const hdrs = await headers();
  const accept = hdrs.get("accept-language");
  const fromHeader = pickFromAcceptLanguage(accept);
  if (fromHeader) return fromHeader;

  return defaultLocale;
}

/**
 * Parse `Accept-Language` (RFC 4647) and return the first supported
 * locale. Parses quality values but ignores `*` and malformed entries.
 *
 * Example: `de-CH;q=0.9,en;q=0.8` → `de` (because `de-CH` matches `de`
 * via primary-subtag fallback).
 */
export function pickFromAcceptLanguage(
  header: string | null,
): Locale | null {
  if (!header) return null;
  const entries = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const qParam = params.find((p) => p.trim().startsWith("q="));
      const q = qParam ? Number(qParam.trim().slice(2)) : 1;
      return { tag: tag.trim().toLowerCase(), q: Number.isFinite(q) ? q : 0 };
    })
    .filter((e) => e.tag.length > 0 && e.q > 0)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of entries) {
    if (isLocale(tag)) return tag;
    const primary = tag.split("-")[0];
    if (isLocale(primary)) return primary;
  }
  return null;
}

/** Expose the cookie name + default max-age so the profile-switcher route
 *  can set it consistently. */
export { defaultLocale, localeCookieName, locales };
export type { Locale };
