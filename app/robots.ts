import type { MetadataRoute } from "next";

const BASE =
  process.env.BETTER_AUTH_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/impressum", "/datenschutz"],
        // Don't index authenticated areas or API endpoints — not useful in
        // search results, and they'd 401 anyway.
        disallow: [
          "/dashboard",
          "/spaces",
          "/notes",
          "/files",
          "/mcp",
          "/profile",
          "/settings",
          "/two-factor",
          "/forgot-password",
          "/reset-password",
          "/api/",
          "/.well-known/",
        ],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
