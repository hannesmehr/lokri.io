import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { ownerAccounts } from "@/lib/db/schema";

/**
 * RFC 9728 — Protected Resource Metadata für team-scoped MCP-Endpoints.
 *
 * Wird über den `resource_metadata`-Hint aus dem 401 von
 * `/api/mcp/team/[slug]` angesteuert. Liefert Claude Desktop /
 * `mcp-remote` die Koordinaten, um den OAuth-Flow zu starten:
 *
 *   - `resource`  → die Team-Endpoint-URL selbst (für audience-Binding
 *                   via RFC 8707, sollte mcp-remote das unterstützen)
 *   - `authorization_servers` → identisch zum Site-Root-Discovery;
 *     Better-Auth's `mcp`-Plugin hat nur einen AS, der ALLE Team-
 *     Resources bedient. Client registriert sich dort dynamisch und
 *     bekommt einen Access-Token, der am Endpoint durchgereicht wird.
 *
 * Slug-Validierung: wir lehnen mit 404 ab, wenn es den Slug nicht gibt
 * oder er kein Team ist. Personal-Slugs haben hier nichts zu suchen
 * (ihr Endpoint ist `/api/mcp`).
 *
 * Caching: 404 wird nicht gecached (Slug könnte gleich existieren),
 * 200 aber schon — die Response ändert sich nur, wenn der Host-Origin
 * wechselt (z. B. preview→prod).
 */
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(req: Request, { params }: RouteContext) {
  const { slug } = await params;

  const [team] = await db
    .select({ id: ownerAccounts.id, type: ownerAccounts.type })
    .from(ownerAccounts)
    .where(eq(ownerAccounts.slug, slug))
    .limit(1);

  if (!team || team.type !== "team") {
    return new Response(
      JSON.stringify({ error: "team_not_found" }),
      {
        status: 404,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const origin = new URL(req.url).origin;
  const resource = `${origin}/api/mcp/team/${encodeURIComponent(slug)}`;

  const metadata = {
    resource,
    authorization_servers: [origin],
    jwks_uri: `${origin}/api/auth/mcp/jwks`,
    scopes_supported: ["openid", "profile", "email", "offline_access"],
    bearer_methods_supported: ["header"],
    resource_signing_alg_values_supported: ["RS256", "none"],
  };

  return new Response(JSON.stringify(metadata), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      // MCP-Clients müssen cross-origin lesen dürfen (sonst Discovery aus
      // einer Chrome-Extension etc. scheitert). Matched das Verhalten
      // des Better-Auth-Helpers für die Site-Root-Discovery.
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      // 5 Minuten — kurz genug dass ein frisch angelegtes Team schnell
      // erreichbar ist, lang genug dass wir nicht jede einzelne
      // MCP-Session mit einer DB-Query bezahlen.
      "Cache-Control": "public, max-age=300",
    },
  });
}
