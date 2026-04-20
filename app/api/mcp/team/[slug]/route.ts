import { createTeamSlugResolver } from "@/lib/mcp/auth";
import { createMcpRouteHandler } from "@/lib/mcp/route-factory";

/**
 * MCP Streamable HTTP endpoint — **team** owner-account scope.
 *
 * Identical to `/api/mcp` (same tools, same auth priority: OAuth 2.1 →
 * legacy bearer) except the session is bound to the team identified by
 * `[slug]` rather than the caller's personal account.
 *
 * Auth rules (delegated to `createTeamSlugResolver`):
 *   - Team must exist and have `type='team'` — personal accounts are
 *     not reachable under this path.
 *   - OAuth caller: must be a member (any role) of the team.
 *   - Legacy `lk_` bearer: the token's `owner_account_id` must equal
 *     the team's id. Tokens minted for another account cannot cross
 *     over, even if the minting user is a team member.
 *
 * Rate-limit buckets are per-slug, so traffic to team A cannot exhaust
 * team B's quota.
 *
 * Claude-Desktop config example:
 * ```json
 * {
 *   "mcpServers": {
 *     "lokri-empro": {
 *       "command": "/path/to/node",
 *       "args": ["/path/to/npx", "-y", "mcp-remote",
 *                "https://lokri.io/api/mcp/team/empro"]
 *     }
 *   }
 * }
 * ```
 */
export const runtime = "nodejs";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ slug: string }> };

async function handle(
  req: Request,
  { params }: RouteContext,
): Promise<Response> {
  const { slug } = await params;
  const handler = createMcpRouteHandler({
    resolveOwnerAccount: createTeamSlugResolver(slug),
    resourceMetadataUrlFor: (r) =>
      `${new URL(r.url).origin}/api/mcp/team/${encodeURIComponent(slug)}/oauth-protected-resource`,
    rateLimitKeyPrefix: `team:${slug}`,
  });
  return handler(req);
}

export { handle as GET, handle as POST, handle as DELETE };
