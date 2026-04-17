import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiTokens } from "@/lib/db/schema";
import { verifyApiToken, TOKEN_FORMAT } from "@/lib/tokens";

export interface McpTokenContext {
  ownerAccountId: string;
  tokenId: string;
  tokenName: string;
}

/**
 * Verify a Bearer plaintext against the `api_tokens` table.
 *
 * The lookup uses `token_prefix` as a cheap index-lookup key, then
 * bcrypt-compares against each matching row (usually one; prefix collisions
 * are statistically rare but possible with short prefixes). Returns `null`
 * on any failure — no information leak about whether the prefix existed.
 *
 * Side effect on success: `last_used_at` is updated fire-and-forget.
 */
export async function verifyBearerToken(
  plaintext: string | null | undefined,
): Promise<McpTokenContext | null> {
  if (!plaintext) return null;
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
      // Fire-and-forget last_used bump. Don't await — the tool call should
      // not be slowed by an audit write.
      db.update(apiTokens)
        .set({ lastUsedAt: new Date() })
        .where(eq(apiTokens.id, row.id))
        .catch((err) => {
          console.error("[mcp/auth] failed to update last_used_at:", err);
        });

      return {
        ownerAccountId: row.ownerAccountId,
        tokenId: row.id,
        tokenName: row.name,
      };
    }
  }

  return null;
}

/** Extract the plaintext from an `Authorization: Bearer lk_…` header. */
export function extractBearer(authHeader: string | null | undefined): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(\S+)\s*$/i);
  return match ? match[1] : null;
}
