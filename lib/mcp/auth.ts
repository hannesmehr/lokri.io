import { and, eq, isNull } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getOrCreateOwnerAccountForUser } from "@/lib/api/session";
import { db } from "@/lib/db";
import {
  apiTokens,
  ownerAccountMembers,
  ownerAccounts,
} from "@/lib/db/schema";
import { TOKEN_FORMAT, verifyApiToken } from "@/lib/tokens";

export interface McpAuthContext {
  ownerAccountId: string;
  /**
   * The human user behind this MCP call, used for connector audit logs
   * (`connector_usage_log.user_id`) and anywhere else per-user
   * attribution is needed.
   *
   * - OAuth path: always set (Better-Auth session carries `userId`).
   * - Legacy path: `apiTokens.createdByUserId` if present; null for
   *   pre-0014 tokens minted before per-user attribution existed.
   */
  userId: string | null;
  tokenId: string;
  tokenName: string;
  /** "oauth" for Better-Auth-issued OAuth 2.1 access tokens, "legacy" for `lk_` bearer. */
  kind: "oauth" | "legacy";
  /**
   * Null/empty = unrestricted. Array = only these spaces are visible/
   * mutable. OAuth tokens don't carry scopes yet (always null).
   */
  spaceScope: string[] | null;
  /** True → mutation tools refuse. OAuth tokens default to false. */
  readOnly: boolean;
}

/**
 * Input to a `resolveOwnerAccount` callback — captures who the caller is
 * and, for legacy-token auth, which owner-account the token was minted
 * for.
 */
export interface ResolveOwnerAccountInput {
  /** Authenticated principal (OAuth userId, or legacy-token's createdByUserId — may be null for pre-0014 tokens). */
  userId: string | null;
  /** For legacy-token auth, the owner_account the token was minted for. Null for OAuth path. */
  legacyOwnerAccountId: string | null;
  kind: "oauth" | "legacy";
}

/**
 * Per-route resolver that maps an authenticated principal to the
 * `owner_account` this MCP session should operate against. The personal
 * endpoint uses a resolver that picks the user's personal account; the
 * team endpoint (`/api/mcp/team/[slug]`) uses a resolver that checks
 * membership in the team referenced by the slug.
 *
 * Return `null` to reject the session (caller turns this into 401). Do
 * NOT throw inside the resolver for normal auth failures — throwing
 * escapes to the route handler and becomes a 500. Reserve throws for
 * genuinely unexpected DB errors.
 */
export type ResolveOwnerAccount = (
  input: ResolveOwnerAccountInput,
) => Promise<string | null>;

/**
 * Resolver for `/api/mcp` (the personal endpoint).
 *
 * - OAuth: look up / self-heal the user's personal `owner_account`.
 * - Legacy: trust `apiTokens.ownerAccountId` as-is — the token was
 *   minted against a specific account, and that's the account we
 *   should run against regardless of what type it is. (A team-scoped
 *   legacy token hitting `/api/mcp` continues to work, same as before.)
 */
export const resolvePersonalOwnerAccount: ResolveOwnerAccount = async ({
  userId,
  legacyOwnerAccountId,
  kind,
}) => {
  if (kind === "oauth") {
    if (!userId) return null;
    return getOrCreateOwnerAccountForUser(userId);
  }
  return legacyOwnerAccountId;
};

/**
 * Factory for `/api/mcp/team/[slug]`-style resolvers. Returns a resolver
 * that:
 *
 * - Looks up the owner_account by slug. Rejects if not found, or if the
 *   account is not a team account (personal accounts must not be
 *   addressable via `/team/[slug]` — that's a different endpoint later).
 * - OAuth path: requires the authenticated user to be a member of the
 *   team. Any `role` in `owner_account_members` is enough to open an
 *   MCP session — route-level read-only/admin gating happens in tools,
 *   not here.
 * - Legacy path: requires `apiTokens.ownerAccountId === team.id`. A
 *   token minted for a different account cannot target this team even
 *   if the minting user is a member — tokens are scoped to the
 *   account they were created for, full stop.
 *
 * Returns null (→ 401) on every failure path. The 401 is intentional
 * over 403/404 — we don't want to leak "this team exists but you're
 * not a member" via a different status code, since slugs are part of
 * the URL and easy to enumerate.
 */
export function createTeamSlugResolver(slug: string): ResolveOwnerAccount {
  return async ({ userId, legacyOwnerAccountId, kind }) => {
    const [team] = await db
      .select({ id: ownerAccounts.id, type: ownerAccounts.type })
      .from(ownerAccounts)
      .where(eq(ownerAccounts.slug, slug))
      .limit(1);

    if (!team) return null;
    if (team.type !== "team") return null;

    if (kind === "legacy") {
      return legacyOwnerAccountId === team.id ? team.id : null;
    }

    // OAuth path: verify membership.
    if (!userId) return null;
    const [member] = await db
      .select({ role: ownerAccountMembers.role })
      .from(ownerAccountMembers)
      .where(
        and(
          eq(ownerAccountMembers.ownerAccountId, team.id),
          eq(ownerAccountMembers.userId, userId),
        ),
      )
      .limit(1);
    return member ? team.id : null;
  };
}

/**
 * Verify an incoming Bearer header against either the OAuth 2.1 token table
 * (issued by Better-Auth's `mcp` plugin) or our legacy `api_tokens` table
 * (plaintext `lk_...` bearers generated in the dashboard).
 *
 * The `resolveOwnerAccount` callback picks the final owner_account for
 * this session — routes use this to enforce team-vs-personal scoping.
 *
 * Returns `null` on any failure — no info leaked about which path failed.
 */
export async function verifyMcpBearer(
  headers: Headers,
  plaintext: string | null | undefined,
  resolveOwnerAccount: ResolveOwnerAccount,
): Promise<McpAuthContext | null> {
  if (!plaintext) return null;

  // ----- 1. OAuth 2.1 token via Better-Auth `mcp` plugin -----
  // `getMcpSession` inspects the Authorization header, validates the access
  // token against `oauth_access_token`, and returns the full row (or null).
  try {
    const oauthSession = await auth.api.getMcpSession({ headers });
    if (oauthSession && oauthSession.userId) {
      const ownerAccountId = await resolveOwnerAccount({
        userId: oauthSession.userId,
        legacyOwnerAccountId: null,
        kind: "oauth",
      });
      if (!ownerAccountId) return null;
      return {
        ownerAccountId,
        userId: oauthSession.userId,
        tokenId: oauthSession.accessToken,
        tokenName: oauthSession.clientId,
        kind: "oauth",
        spaceScope: null,
        readOnly: false,
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
      spaceScope: apiTokens.spaceScope,
      readOnly: apiTokens.readOnly,
      createdByUserId: apiTokens.createdByUserId,
    })
    .from(apiTokens)
    .where(
      and(eq(apiTokens.tokenPrefix, prefix), isNull(apiTokens.revokedAt)),
    );

  for (const row of candidates) {
    if (await verifyApiToken(plaintext, row.tokenHash)) {
      const ownerAccountId = await resolveOwnerAccount({
        userId: row.createdByUserId,
        legacyOwnerAccountId: row.ownerAccountId,
        kind: "legacy",
      });
      if (!ownerAccountId) return null;

      db.update(apiTokens)
        .set({ lastUsedAt: new Date() })
        .where(eq(apiTokens.id, row.id))
        .catch((err) => {
          console.error("[mcp/auth] last_used_at update failed:", err);
        });
      return {
        ownerAccountId,
        userId: row.createdByUserId,
        tokenId: row.id,
        tokenName: row.name,
        kind: "legacy",
        spaceScope: row.spaceScope && row.spaceScope.length > 0 ? row.spaceScope : null,
        readOnly: row.readOnly,
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
