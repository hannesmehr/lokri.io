import { resolvePersonalOwnerAccount } from "@/lib/mcp/auth";
import { createMcpRouteHandler } from "@/lib/mcp/route-factory";

/**
 * MCP Streamable HTTP endpoint — **personal** owner-account scope.
 *
 * Authentication priority:
 *   1. OAuth 2.1 access token issued by Better-Auth's `mcp` plugin. Clients
 *      discover us via `/.well-known/oauth-protected-resource`, register
 *      dynamically via `/api/auth/mcp/register`, and complete PKCE flows.
 *   2. Legacy `lk_...` bearer tokens minted in the dashboard. Kept so
 *      existing CLI/script integrations don't break.
 *
 * This endpoint always runs against the authenticated user's **personal**
 * owner_account (self-healed on first use via
 * `getOrCreateOwnerAccountForUser`). To target a team's connector
 * integrations, use `/api/mcp/team/[slug]` instead.
 *
 * On a missing/invalid bearer, we return 401 with a `WWW-Authenticate`
 * header pointing to the Protected Resource Metadata (RFC 9728). Claude
 * Desktop and other spec-compliant clients follow this automatically to
 * kick off the OAuth flow.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

const handle = createMcpRouteHandler({
  resolveOwnerAccount: resolvePersonalOwnerAccount,
  resourceMetadataUrlFor: (req) =>
    `${new URL(req.url).origin}/.well-known/oauth-protected-resource`,
});

export { handle as GET, handle as POST, handle as DELETE };
