import { oAuthDiscoveryMetadata } from "better-auth/plugins";
import { auth } from "@/lib/auth";

/**
 * RFC 8414 — OAuth 2.0 Authorization Server Metadata.
 * The better-auth `mcp` plugin serves this under its own base (/api/auth/...)
 * but Claude Desktop and most MCP clients probe the root. This thin handler
 * proxies to the plugin's endpoint.
 */
export const GET = oAuthDiscoveryMetadata(auth);
