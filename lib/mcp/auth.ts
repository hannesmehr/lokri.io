import { and, eq, isNull } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getOrCreateOwnerAccountForUser } from "@/lib/api/session";
import { db } from "@/lib/db";
import { apiTokens } from "@/lib/db/schema";
import { TOKEN_FORMAT, verifyApiToken } from "@/lib/tokens";

export interface McpAuthContext {
  ownerAccountId: string;
  tokenId: string;
  tokenName: string;
  /** "oauth" for Better-Auth-issued OAuth 2.1 access tokens, "legacy" for `lk_` bearer. */
  kind: "oauth" | "legacy";
}

/**
 * Verify an incoming Bearer header against either the OAuth 2.1 token table
 * (issued by Better-Auth's `mcp` plugin) or our legacy `api_tokens` table
 * (plaintext `lk_...` bearers generated in the dashboard).
 *
 * Returns `null` on any failure — no info leaked about which path failed.
 */
export async function verifyMcpBearer(
  headers: Headers,
  plaintext: string | null | undefined,
): Promise<McpAuthContext | null> {
  if (!plaintext) return null;

  // ----- 1. OAuth 2.1 token via Better-Auth `mcp` plugin -----
  // `getMcpSession` inspects the Authorization header, validates the access
  // token against `oauth_access_token`, and returns the full row (or null).
  try {
    const oauthSession = await auth.api.getMcpSession({ headers });
    if (oauthSession && oauthSession.userId) {
      const ownerAccountId = await getOrCreateOwnerAccountForUser(
        oauthSession.userId,
      );
      return {
        ownerAccountId,
        tokenId: oauthSession.accessToken,
        tokenName: oauthSession.clientId,
        kind: "oauth",
      };
    }
  } catch {
    // Fall through to legacy bearer path.
  }

  // ----- 2. Legacy `lk_...` bearer tokens (dashboard-minted) -----
  if (!plaintext.startsWith(TOKEN_FORMAT.prefix)) return null;

  const prefix = plaintext.slice(0, TOKEN_FORMAT.displayPrefixLength);

  const candidates = await db
    .select({
      id: apiTokens.id,
      ownerAccountId: apiTokens.ownerAccountId,
      name: apiTokens.name,
      tokenHash: apiTokens.tokenHash,
    })
    .from(apiTokens)
    .where(
      and(eq(apiTokens.tokenPrefix, prefix), isNull(apiTokens.revokedAt)),
    );

  for (const row of candidates) {
    if (await verifyApiToken(plaintext, row.tokenHash)) {
      db.update(apiTokens)
        .set({ lastUsedAt: new Date() })
        .where(eq(apiTokens.id, row.id))
        .catch((err) => {
          console.error("[mcp/auth] last_used_at update failed:", err);
        });
      return {
        ownerAccountId: row.ownerAccountId,
        tokenId: row.id,
        tokenName: row.name,
        kind: "legacy",
      };
    }
  }

  return null;
}

/** Pull the plaintext bearer from an `Authorization` header. */
export function extractBearer(
  authHeader: string | null | undefined,
): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(\S+)\s*$/i);
  return match ? match[1] : null;
}
