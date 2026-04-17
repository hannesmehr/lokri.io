import { NextResponse, type NextRequest } from "next/server";
import {
  ipFromHeaders,
  limit,
  rateLimitResponse,
  type LimiterName,
} from "@/lib/rate-limit";

/**
 * Edge proxy (née "middleware" in Next 15 — renamed in Next 16). First line
 * of defense before any route handler runs.
 *
 * Layered strategy:
 *   1. Every API request hits `globalIp` with a generous per-IP budget
 *      (600/min). Catches runaway bots before they reach route handlers.
 *   2. Specific sensitive paths (signup, signin, DCR, password reset) get
 *      stricter budgets on top. These trigger first — if a stricter limit is
 *      exceeded we never touch the global counter for this request.
 *   3. Route handlers add a final per-user limit where the identifier is the
 *      authenticated principal (so one abusive user doesn't poison an IP).
 */

// Paths that need stricter-than-global limits. Ordered most-specific first.
// The limiter name + the identifier-source signals how to key the check.
const SENSITIVE: Array<{
  pattern: RegExp;
  limiter: LimiterName;
}> = [
  { pattern: /^\/api\/auth\/sign-up(\/|$)/, limiter: "authSignup" },
  { pattern: /^\/api\/auth\/sign-in(\/|$)/, limiter: "authSignin" },
  { pattern: /^\/api\/auth\/forget-password(\/|$)/, limiter: "authForgot" },
  { pattern: /^\/api\/auth\/mcp\/register(\/|$)/, limiter: "oauthRegister" },
  { pattern: /^\/api\/auth\/mcp\/(authorize|token)(\/|$)/, limiter: "oauthHot" },
];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const ip = ipFromHeaders(req.headers);

  // 1. Specific sensitive paths first.
  for (const entry of SENSITIVE) {
    if (entry.pattern.test(pathname)) {
      const result = await limit(entry.limiter, `ip:${ip}`);
      if (!result.ok) return rateLimitResponse(result);
      break; // do not double-count against global
    }
  }

  // 2. Global per-IP cap on all /api/* traffic (including MCP + well-known).
  if (pathname.startsWith("/api/") || pathname.startsWith("/.well-known/")) {
    const result = await limit("globalIp", `ip:${ip}`);
    if (!result.ok) return rateLimitResponse(result);
  }

  return NextResponse.next();
}

/**
 * Match API + well-known paths + auth API paths. Skip static assets, Next
 * internals, images, fonts. Pages are not rate-limited at the edge; the
 * cost is low and rate-limiting them confuses normal browsing.
 */
export const config = {
  matcher: [
    "/api/:path*",
    "/.well-known/:path*",
  ],
};
