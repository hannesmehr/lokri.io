import { NextResponse, type NextRequest } from "next/server";
import { pickFromAcceptLanguage } from "@/lib/i18n/locale";
import {
  defaultLocale,
  isLocale,
  localeCookieMaxAge,
  localeCookieName,
} from "@/lib/i18n/config";
import {
  ipFromHeaders,
  limit,
  rateLimitResponse,
  type LimiterName,
} from "@/lib/rate-limit";

/**
 * Edge proxy (née "middleware" in Next 15 — renamed in Next 16). Two
 * responsibilities, in this order:
 *
 *   1. **Rate-limiting** on `/api/*` + `/.well-known/*`. Layered: sensitive
 *      paths get their own bucket first, everything else hits the shared
 *      `globalIp` bucket.
 *   2. **Locale-cookie seeding** on page requests. We do NOT run next-intl's
 *      own middleware (no URL prefixes); cookie + `Accept-Language` are
 *      inspected server-side in `lib/i18n/request.ts`. For stable UX we
 *      set the cookie once on the first page visit — subsequent requests
 *      hit a fast hit-path without re-parsing the header.
 */

const SENSITIVE: Array<{ pattern: RegExp; limiter: LimiterName }> = [
  { pattern: /^\/api\/auth\/sign-up(\/|$)/, limiter: "authSignup" },
  { pattern: /^\/api\/auth\/sign-in(\/|$)/, limiter: "authSignin" },
  { pattern: /^\/api\/auth\/forget-password(\/|$)/, limiter: "authForgot" },
  { pattern: /^\/api\/auth\/mcp\/register(\/|$)/, limiter: "oauthRegister" },
  { pattern: /^\/api\/auth\/mcp\/(authorize|token)(\/|$)/, limiter: "oauthHot" },
];

/**
 * Attach a `Set-Cookie` for the locale if none is present. Uses
 * `Accept-Language` to pick one of our supported locales, otherwise the
 * default. Cookie is readable from client (not httpOnly) so the profile
 * switcher can flip it without a round-trip.
 */
function ensureLocaleCookie(req: NextRequest, res: NextResponse): void {
  const existing = req.cookies.get(localeCookieName)?.value;
  if (isLocale(existing)) return;

  const fromHeader = pickFromAcceptLanguage(req.headers.get("accept-language"));
  const locale = fromHeader ?? defaultLocale;

  res.cookies.set({
    name: localeCookieName,
    value: locale,
    path: "/",
    sameSite: "lax",
    httpOnly: false,
    maxAge: localeCookieMaxAge,
  });
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const ip = ipFromHeaders(req.headers);

  // ── Rate-limiting branch (API + .well-known only) ────────────────────
  if (pathname.startsWith("/api/") || pathname.startsWith("/.well-known/")) {
    for (const entry of SENSITIVE) {
      if (entry.pattern.test(pathname)) {
        const result = await limit(entry.limiter, `ip:${ip}`);
        if (!result.ok) return rateLimitResponse(result);
        break; // do not double-count against global
      }
    }
    const result = await limit("globalIp", `ip:${ip}`);
    if (!result.ok) return rateLimitResponse(result);
    return NextResponse.next();
  }

  // ── Page branch: pass-through + locale cookie seeding ───────────────
  const res = NextResponse.next();
  ensureLocaleCookie(req, res);
  return res;
}

/**
 * Matcher covers everything except static assets and Next internals.
 * Pages pass through with just the locale-cookie seeding; API +
 * well-known routes still get rate-limited.
 */
export const config = {
  matcher: [
    // Everything except _next internals, favicon, static files, OpenGraph
    // image generation, robots/sitemap, manifest. The negative-lookahead
    // keeps the matcher cheap.
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|opengraph-image|apple-icon|icon|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|otf|eot|css|js|map)).*)",
  ],
};
