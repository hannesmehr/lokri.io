import { getRequestConfig } from "next-intl/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { resolveLocale } from "./locale";

/**
 * next-intl request-config. Called once per request by the framework
 * (via the `createNextIntlPlugin` wiring in `next.config.ts`). Must be
 * the *default export*.
 *
 * We do not use next-intl's routing/middleware — URLs stay prefix-free
 * (`/dashboard`, not `/de/dashboard`). Locale detection happens here
 * server-side via `resolveLocale`, which in turn hits the session
 * (for `users.preferred_locale`), then cookie, then Accept-Language.
 *
 * Performance: `auth.api.getSession` is already a near-zero-cost call
 * inside a rendered request — Better-Auth caches the session per request.
 * Pulling the userId here keeps the DB-preference path working on every
 * authenticated render.
 */
export default getRequestConfig(async () => {
  let userId: string | null = null;
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    userId = session?.user?.id ?? null;
  } catch {
    // Session lookups can throw during build / tests — tolerate and
    // fall through to cookie/header resolution.
  }

  const locale = await resolveLocale(userId);

  // `messages/{locale}.json` lives at the repo root. JSON imports are
  // tree-shaken out for the other locale on each request.
  const messages = (await import(`../../messages/${locale}.json`)).default;

  return {
    locale,
    messages,
    // Shared timezone so server-rendered dates match client output even
    // without an explicit `timeZone` per formatter call.
    timeZone: "Europe/Berlin",
  };
});
