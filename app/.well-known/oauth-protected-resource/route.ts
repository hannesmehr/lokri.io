import { oAuthProtectedResourceMetadata } from "better-auth/plugins";
import { auth } from "@/lib/auth";

/**
 * RFC 9728 — OAuth 2.0 Protected Resource Metadata.
 * Lists the authorization server(s) that issue tokens for /api/mcp. Claude
 * Desktop reads this after receiving the 401 + `WWW-Authenticate` hint from
 * /api/mcp, then follows it to discover the AS metadata.
 */
export const GET = oAuthProtectedResourceMetadata(auth);
