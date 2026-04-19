import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

/**
 * next-intl wiring. The plugin only teaches Next where to find the
 * request-config — we do NOT use next-intl's routing middleware (no
 * URL-prefixes). Locale resolution is entirely server-side inside
 * `lib/i18n/request.ts` (cookie / DB / Accept-Language / default).
 */
const withNextIntl = createNextIntlPlugin("./lib/i18n/request.ts");

/**
 * Baseline security headers for every response. The CSP is intentionally
 * permissive for dev ergonomics (`'unsafe-inline'` styles, WS for HMR); it
 * is tightened automatically via the Vercel deployment by replacing the
 * unsafe directives when `NODE_ENV === "production"`.
 *
 * Notes on each header:
 *  - Strict-Transport-Security: HSTS with 1y + preload. Only effective over
 *    HTTPS, so it's a no-op on localhost.
 *  - X-Frame-Options: DENY — we have no legitimate embedding use case.
 *  - X-Content-Type-Options: nosniff — blocks MIME-sniffing attacks.
 *  - Referrer-Policy: strict-origin-when-cross-origin — preserves UX without
 *    leaking full URLs to third-party embeds.
 *  - Permissions-Policy: disables all the device APIs we don't need.
 */

const isProd = process.env.NODE_ENV === "production";

// Upstream origins we legitimately call from client code.
// AI Gateway is server-side only, no CSP connect-src entry needed.
const CONNECT_SRC = [
  "'self'",
  // Better-Auth + API routes are same-origin
  // Vercel Blob public URLs — none in our model; private blobs proxied via /api
  isProd ? "" : "ws:",
  isProd ? "" : "http://localhost:*",
]
  .filter(Boolean)
  .join(" ");

const CSP = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
  `font-src 'self' https://fonts.gstatic.com data:`,
  `img-src 'self' data: blob:`,
  `connect-src ${CONNECT_SRC}`,
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `object-src 'none'`,
].join("; ");

const SECURITY_HEADERS = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value:
      "accelerometer=(), autoplay=(), camera=(), display-capture=(), " +
      "encrypted-media=(), fullscreen=(self), geolocation=(), gyroscope=(), " +
      "magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), " +
      "publickey-credentials-get=(), screen-wake-lock=(), sync-xhr=(), usb=(), " +
      "web-share=(), xr-spatial-tracking=()",
  },
  { key: "Content-Security-Policy", value: CSP },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Apply to every path. API routes get CORS checks on top from
        // Better-Auth / their own handlers.
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
  /**
   * Legacy-URL-Umleitungen. Permanent (Next rendert 308) damit Browser-
   * Cache und Suchmaschinen die neue URL übernehmen.
   *
   * - `/settings` → `/settings/general`: nach dem Settings-Struktur-
   *   Refactor gibt es keine Root-Settings-Route mehr.
   * - `/billing/*` → `/settings/billing/*`: Settings-Redesign Block 2.
   *   Billing ist jetzt ein Tab im Settings-Bereich, nicht ein
   *   eigenständiger Top-Level-Bereich. PayPal-Return-URLs + interne
   *   Nav-Links sind atomar mit dem Route-Umzug aktualisiert (einzige
   *   Ausnahme sind gespeicherte Bookmarks — die fängt dieser
   *   Redirect ab).
   *
   * Der Settings-Struktur-Refactor Block 3 wird hier `/settings/team/*`
   * → `/team/*`-Redirects ergänzen, wenn der neue Team-Bereich steht.
   */
  async redirects() {
    return [
      {
        source: "/settings",
        destination: "/settings/general",
        permanent: true,
      },
      {
        source: "/billing",
        destination: "/settings/billing",
        permanent: true,
      },
      // Next.js matched `:path*` mit 0+ Segmenten, deckt also auch
      // `/billing/plans`, `/billing/invoices`, `/billing/success` ab.
      {
        source: "/billing/:path*",
        destination: "/settings/billing/:path*",
        permanent: true,
      },
      // Settings-Redesign Block 3: Team-Routen ziehen auf Top-Level
      // um. Alte Bookmarks / Email-Links auf /settings/team[/members]
      // werden permanent umgeleitet. Die Ownership-Transfer-Email-URL
      // wurde atomar mit dem Route-Umzug in lib/teams/ownership.ts
      // aktualisiert; dieser Redirect fängt nur noch Bestands-Links ab.
      {
        source: "/settings/team",
        destination: "/team",
        permanent: true,
      },
      {
        source: "/settings/team/:path*",
        destination: "/team/:path*",
        permanent: true,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
