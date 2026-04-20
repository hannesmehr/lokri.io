/**
 * Factory für MCP-Route-Handler.
 *
 * Zieht die Gemeinsamkeiten zwischen `/api/mcp` (personal) und
 * `/api/mcp/team/[slug]` (team-scoped) in eine Stelle: MCP-Handler-
 * Setup, Auth-Wrapping, Rate-Limit, 401-WWW-Authenticate-Anreicherung.
 * Jeder konkrete Endpoint liefert nur noch den passenden
 * `resolveOwnerAccount`-Callback und die URL der Protected-Resource-
 * Metadata für den 401-Fall.
 */

import { createMcpHandler, withMcpAuth } from "mcp-handler";
import {
  extractBearer,
  verifyMcpBearer,
  type ResolveOwnerAccount,
} from "@/lib/mcp/auth";
import { registerConnectorTools } from "@/lib/mcp/connectors";
import { registerPrompts } from "@/lib/mcp/prompts";
import { registerResources } from "@/lib/mcp/resources";
import { registerTools } from "@/lib/mcp/tools";
import {
  ipFromHeaders,
  limit,
  rateLimitResponse,
} from "@/lib/rate-limit";

export interface McpRouteConfig {
  /** Per-request resolver, mapping principal → owner_account. */
  resolveOwnerAccount: ResolveOwnerAccount;
  /**
   * Absolute URL the 401 `WWW-Authenticate` header points at via
   * `resource_metadata=`. For `/api/mcp` → site-root
   * `/.well-known/oauth-protected-resource`. For
   * `/api/mcp/team/[slug]` → `/api/mcp/team/[slug]/oauth-protected-resource`.
   * Caller computes this from the incoming request's origin (so dev
   * and preview-deploy URLs work automatically).
   */
  resourceMetadataUrlFor: (req: Request) => string;
  /**
   * Optional prefix injected into the rate-limit bucket key so different
   * endpoints (personal vs each team) have independent token buckets.
   * Default: empty string — matches the historical personal-endpoint
   * behaviour where `bearerKey` is used unchanged.
   */
  rateLimitKeyPrefix?: string;
}

/** MCP-Handler Singleton — Tools sind stateless, ein Handler reicht für alle Routes. */
const mcpHandler = createMcpHandler(
  (server) => {
    registerTools(server);
    registerConnectorTools(server);
    registerPrompts(server);
    registerResources(server);
  },
  {},
  { basePath: "/api" },
);

/** Short, opaque key for Redis — avoids storing the full bearer in rate-limit buckets. */
function bearerKey(
  bearer: string | null,
  ip: string,
  prefix: string,
): string {
  const base = bearer ? `t:${bearer.slice(0, 16)}` : `ip:${ip}`;
  return prefix ? `${prefix}:${base}` : base;
}

/**
 * Erzeugt einen Next-Route-Handler (GET/POST/DELETE) für einen
 * konfigurierten MCP-Endpoint.
 *
 * Der zurückgegebene Handler:
 *   1. Holt den Bearer, baut den Rate-Limit-Key mit Prefix
 *   2. Wendet die `mcpCall`-Rate-Limit an (pre-auth, damit invalid-
 *      token-Spammer nicht die bcrypt-CPU verbrennen)
 *   3. Läuft durch `withMcpAuth` — Auth schlägt `verifyMcpBearer`
 *      mit dem endpoint-spezifischen Resolver nach
 *   4. Reichert ein 401-Response um `WWW-Authenticate` + das
 *      endpoint-spezifische `resource_metadata` an (RFC 9728)
 */
export function createMcpRouteHandler(config: McpRouteConfig) {
  const authed = withMcpAuth(
    mcpHandler,
    async (req, bearer) => {
      const plaintext =
        bearer ?? extractBearer(req.headers.get("authorization"));
      const ctx = await verifyMcpBearer(
        req.headers,
        plaintext,
        config.resolveOwnerAccount,
      );
      if (!ctx) return undefined; // mcp-handler returns 401 when required
      return {
        token: plaintext ?? "",
        clientId: ctx.tokenId,
        scopes: [],
        extra: {
          ownerAccountId: ctx.ownerAccountId,
          userId: ctx.userId,
          authKind: ctx.kind,
          spaceScope: ctx.spaceScope,
          readOnly: ctx.readOnly,
        },
      };
    },
    { required: true },
  );

  const prefix = config.rateLimitKeyPrefix ?? "";

  return async function handle(req: Request): Promise<Response> {
    const bearer = extractBearer(req.headers.get("authorization"));
    const ip = ipFromHeaders(req.headers);
    const rl = await limit("mcpCall", bearerKey(bearer, ip, prefix));
    if (!rl.ok) return rateLimitResponse(rl);

    const res = await authed(req);
    if (res.status !== 401) return res;

    const resourceMetadataUrl = config.resourceMetadataUrlFor(req);
    const headers = new Headers(res.headers);
    headers.set(
      "WWW-Authenticate",
      `Bearer realm="lokri", resource_metadata="${resourceMetadataUrl}"`,
    );
    // Rebuild — a Response body stream can only be consumed once.
    const body = await res.arrayBuffer();
    return new Response(body, { status: 401, headers });
  };
}
