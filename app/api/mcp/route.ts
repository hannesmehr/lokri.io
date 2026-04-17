import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { extractBearer, verifyMcpBearer } from "@/lib/mcp/auth";
import { registerTools } from "@/lib/mcp/tools";

/**
 * MCP Streamable HTTP endpoint.
 *
 * Authentication priority:
 *   1. OAuth 2.1 access token issued by Better-Auth's `mcp` plugin. Clients
 *      discover us via `/.well-known/oauth-protected-resource`, register
 *      dynamically via `/api/auth/mcp/register`, and complete PKCE flows.
 *   2. Legacy `lk_...` bearer tokens minted in the dashboard. Kept so
 *      existing CLI/script integrations don't break.
 *
 * On a missing/invalid bearer, we return 401 with a `WWW-Authenticate`
 * header pointing to the Protected Resource Metadata (RFC 9728). Claude
 * Desktop and other spec-compliant clients follow this automatically to
 * kick off the OAuth flow.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

const handler = createMcpHandler(
  (server) => registerTools(server),
  {},
  { basePath: "/api" },
);

const authed = withMcpAuth(
  handler,
  async (req, bearer) => {
    const plaintext = bearer ?? extractBearer(req.headers.get("authorization"));
    const ctx = await verifyMcpBearer(req.headers, plaintext);
    if (!ctx) return undefined; // mcp-handler returns 401 when required
    return {
      token: plaintext ?? "",
      clientId: ctx.tokenId,
      scopes: [],
      extra: { ownerAccountId: ctx.ownerAccountId, authKind: ctx.kind },
    };
  },
  { required: true },
);

/**
 * Wrap the authenticated handler so a 401 gets the RFC 9728 hint the spec
 * requires for OAuth 2.1 discovery (`mcp-handler`'s built-in 401 omits it).
 */
async function handle(req: Request): Promise<Response> {
  const res = await authed(req);
  if (res.status !== 401) return res;

  const origin = new URL(req.url).origin;
  const headers = new Headers(res.headers);
  headers.set(
    "WWW-Authenticate",
    `Bearer realm="lokri", resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
  );
  // Re-build response because Headers is mutable but the body stream can
  // only be consumed once.
  const body = await res.arrayBuffer();
  return new Response(body, { status: 401, headers });
}

export { handle as GET, handle as POST, handle as DELETE };
