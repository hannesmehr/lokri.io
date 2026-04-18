import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Upstash-backed rate limiting. All public endpoints + expensive authenticated
 * endpoints flow through one of the named limiters below.
 *
 * Configuration:
 *   - `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` — required in
 *     production. Missing env → limiter is inert (every call returns allow).
 *     We log a warning so dev doesn't get confused, but don't crash: lets us
 *     develop + run local builds without Redis.
 *
 * Why Upstash and not Vercel KV / in-memory:
 *   - Vercel serverless invocations don't share memory — a Map-based limiter
 *     is per-container, effectively broken.
 *   - Upstash REST API works from both Edge Middleware and Node handlers.
 *   - Free tier is ~10k commands/day which covers early traffic comfortably.
 */

type Duration =
  | `${number} ms`
  | `${number} s`
  | `${number} m`
  | `${number} h`
  | `${number} d`;

interface LimiterConfig {
  /** Logical name — stored as the Redis key prefix. */
  name: string;
  /** Number of requests allowed within `window`. */
  limit: number;
  /** Rolling window, e.g. "1 m", "5 m", "1 h". */
  window: Duration;
  /**
   * Analytics bump is an extra Redis round-trip. Enable on sensitive routes
   * where we want the Upstash dashboard to show per-key distribution.
   */
  analytics?: boolean;
}

// Accept both naming conventions:
//   - UPSTASH_REDIS_REST_URL / _TOKEN  (upstream Upstash default)
//   - KV_REST_API_URL / _TOKEN         (Vercel Marketplace integration)
// Vercel's Upstash integration only sets the latter, so `vercel env pull`
// lands them with the KV_ prefix.
const REDIS_URL =
  process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const REDIS_TOKEN =
  process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

const ENABLED = Boolean(REDIS_URL && REDIS_TOKEN);
const STRICT_IN_PRODUCTION = process.env.NODE_ENV === "production";

if (!ENABLED && process.env.NODE_ENV === "production") {
  console.warn(
    "[rate-limit] No Upstash env vars set in production — requests are NOT " +
      "being rate-limited. Set UPSTASH_REDIS_REST_URL/TOKEN or " +
      "KV_REST_API_URL/TOKEN (Vercel integration).",
  );
}

const redis = ENABLED
  ? new Redis({ url: REDIS_URL!, token: REDIS_TOKEN! })
  : null;

function makeLimiter(cfg: LimiterConfig): Ratelimit | null {
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(cfg.limit, cfg.window),
    prefix: `lokri:rl:${cfg.name}`,
    analytics: cfg.analytics ?? false,
  });
}

/**
 * Pre-configured limiters by purpose. Numbers are intentionally conservative
 * for launch; tune up once we have real traffic data.
 */
export const limiters = {
  /** Global IP fallback applied from Edge Middleware. */
  globalIp: makeLimiter({
    name: "global-ip",
    limit: 600,
    window: "1 m",
    analytics: true,
  }),

  /** Signup — anti-fraud / anti-spam. */
  authSignup: makeLimiter({
    name: "auth-signup",
    limit: 5,
    window: "1 h",
    analytics: true,
  }),

  /** Login — credential stuffing protection. */
  authSignin: makeLimiter({
    name: "auth-signin",
    limit: 20,
    window: "5 m",
    analytics: true,
  }),

  /** Password reset — abuse protection. */
  authForgot: makeLimiter({
    name: "auth-forgot",
    limit: 3,
    window: "1 h",
  }),

  /** OAuth DCR — limit client-registration spam. */
  oauthRegister: makeLimiter({
    name: "oauth-register",
    limit: 10,
    window: "1 h",
    analytics: true,
  }),

  /** OAuth authorize/token — high traffic but protect against runaway loops. */
  oauthHot: makeLimiter({
    name: "oauth-hot",
    limit: 120,
    window: "1 m",
  }),

  /** MCP JSON-RPC endpoint — per authenticated principal. */
  mcpCall: makeLimiter({
    name: "mcp-call",
    limit: 300,
    window: "1 m",
  }),

  /** Semantic search — hits AI Gateway, expensive. */
  search: makeLimiter({
    name: "search",
    limit: 60,
    window: "1 m",
  }),

  /** Note create/update — embeds on every call. */
  noteWrite: makeLimiter({
    name: "note-write",
    limit: 30,
    window: "1 m",
  }),

  /** File upload — multipart + storage + optional embeddings. */
  fileUpload: makeLimiter({
    name: "file-upload",
    limit: 20,
    window: "1 m",
  }),

  /** Token create — cheap but abuse risk (DB rows). */
  tokenCreate: makeLimiter({
    name: "token-create",
    limit: 10,
    window: "1 h",
  }),

  /** Space-wide reindex — expensive (fan-out to AI Gateway). */
  reindex: makeLimiter({
    name: "reindex",
    limit: 5,
    window: "10 m",
  }),
} satisfies Record<string, Ratelimit | null>;

export type LimiterName = keyof typeof limiters;

export interface LimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  /** Epoch ms when the window rolls over. */
  reset: number;
  reason?: "disabled" | "exceeded";
}

/**
 * Run a limiter. When Upstash is not configured the call is a no-op that
 * returns `{ ok: true }` — callers shouldn't need to guard on env themselves.
 */
export async function limit(
  name: LimiterName,
  identifier: string,
): Promise<LimitResult> {
  const limiter = limiters[name];
  if (!limiter) {
    if (STRICT_IN_PRODUCTION && name !== "globalIp") {
      return {
        ok: false,
        limit: 0,
        remaining: 0,
        reset: Date.now() + 60_000,
        reason: "disabled",
      };
    }
    return { ok: true, limit: 0, remaining: 0, reset: 0, reason: "disabled" };
  }
  const res = await limiter.limit(identifier);
  return {
    ok: res.success,
    limit: res.limit,
    remaining: res.remaining,
    reset: res.reset,
    reason: res.success ? undefined : "exceeded",
  };
}

/**
 * Standard 429 response with the headers the `RateLimit-*` spec recommends
 * plus `Retry-After` for broad client support.
 */
export function rateLimitResponse(result: LimitResult): Response {
  const disabled = result.reason === "disabled";
  const retrySeconds = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
  return new Response(
    JSON.stringify({
      error: disabled
        ? "Rate limiting unavailable"
        : "Rate limit exceeded",
      retryAfterSeconds: retrySeconds,
    }),
    {
      status: disabled ? 503 : 429,
      headers: {
        "content-type": "application/json",
        "retry-after": String(retrySeconds),
        "ratelimit-limit": String(result.limit),
        "ratelimit-remaining": String(result.remaining),
        "ratelimit-reset": String(Math.ceil(result.reset / 1000)),
      },
    },
  );
}

/**
 * Pull the caller's IP from standard Vercel / proxy headers. Returns
 * `"unknown"` as a last resort so rate-limiting still binds to *something*.
 */
export function ipFromHeaders(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return (
    headers.get("x-real-ip") ??
    headers.get("cf-connecting-ip") ??
    "unknown"
  );
}
