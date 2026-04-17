import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { verifyBearerToken } from "@/lib/mcp/auth";
import { registerTools } from "@/lib/mcp/tools";

/**
 * MCP Streamable HTTP endpoint. Authenticated with a Bearer token minted in
 * the web dashboard (stored as bcrypt hash in `api_tokens`).
 *
 * We run on Node.js runtime — `bcryptjs` wants Node's `crypto`, and
 * `@modelcontextprotocol/sdk` uses Node-only APIs inside the transport.
 *
 * Stateless: no Redis, no SSE session persistence. Each request is its own
 * JSON-RPC exchange. Per-request account scoping happens via
 * `extra.authInfo.extra.ownerAccountId` inside each tool callback.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

const handler = createMcpHandler(
  (server) => {
    // Tools read the account id from the per-call auth context. The factory
    // itself is per-request in stateless mode, but we avoid touching the
    // request here so registerTools stays pure.
    registerTools(server);
  },
  {},
  { basePath: "/api" },
);

const authedHandler = withMcpAuth(
  handler,
  async (_req, bearer) => {
    const ctx = await verifyBearerToken(bearer);
    if (!ctx) return undefined; // mcp-handler returns 401 when required
    return {
      token: bearer ?? "",
      clientId: ctx.tokenId,
      scopes: [],
      extra: { ownerAccountId: ctx.ownerAccountId },
    };
  },
  { required: true },
);

export { authedHandler as GET, authedHandler as POST, authedHandler as DELETE };
