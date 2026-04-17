import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  apiError,
  parseJsonBody,
  serverError,
  unauthorized,
  zodError,
} from "@/lib/api/errors";
import { ApiAuthError, requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { apiTokens, spaces } from "@/lib/db/schema";
import { limit, rateLimitResponse } from "@/lib/rate-limit";
import { generateApiToken } from "@/lib/tokens";

const createBodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  /**
   * Optional space-scoping — array of space UUIDs. Null/empty ⇒ the token
   * has full account-wide access. We validate that every id belongs to the
   * owner account before persisting.
   */
  space_scope: z.array(z.string().uuid()).max(50).optional(),
  /** Optional — if true, mutation tools refuse. Default false. */
  read_only: z.boolean().optional(),
});

export async function GET() {
  try {
    const { ownerAccountId } = await requireSessionWithAccount();

    const rows = await db
      .select({
        id: apiTokens.id,
        name: apiTokens.name,
        tokenPrefix: apiTokens.tokenPrefix,
        spaceScope: apiTokens.spaceScope,
        readOnly: apiTokens.readOnly,
        lastUsedAt: apiTokens.lastUsedAt,
        createdAt: apiTokens.createdAt,
        revokedAt: apiTokens.revokedAt,
      })
      .from(apiTokens)
      .where(
        and(
          eq(apiTokens.ownerAccountId, ownerAccountId),
          isNull(apiTokens.revokedAt),
        ),
      )
      .orderBy(desc(apiTokens.createdAt));

    return NextResponse.json({ tokens: rows });
  } catch (err) {
    if (err instanceof ApiAuthError) return unauthorized(err.message);
    return serverError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { ownerAccountId } = await requireSessionWithAccount();
    const rl = await limit("tokenCreate", `u:${ownerAccountId}`);
    if (!rl.ok) return rateLimitResponse(rl);

    const json = await parseJsonBody(req, 16 * 1024);
    const parsed = createBodySchema.safeParse(json);
    if (!parsed.success) return zodError(parsed.error);

    // Validate space_scope IDs — every one must be owned by this account.
    // This is crucial: without the check, a malicious client could smuggle
    // foreign UUIDs into their token and bypass ownership filters later
    // (though the tools *also* re-check ownership via ownerAccountId, so
    // this is defence in depth — the API boundary rejects bogus IDs early).
    let scope: string[] | null = null;
    if (parsed.data.space_scope && parsed.data.space_scope.length > 0) {
      const ids = [...new Set(parsed.data.space_scope)];
      const owned = await db
        .select({ id: spaces.id })
        .from(spaces)
        .where(
          and(
            eq(spaces.ownerAccountId, ownerAccountId),
            inArray(spaces.id, ids),
          ),
        );
      if (owned.length !== ids.length) {
        return apiError(
          "Einer oder mehrere Space-IDs gehören nicht zu diesem Account.",
          400,
        );
      }
      scope = ids;
    }

    const { plaintext, prefix, hash } = await generateApiToken();

    const [row] = await db
      .insert(apiTokens)
      .values({
        ownerAccountId,
        name: parsed.data.name,
        tokenHash: hash,
        tokenPrefix: prefix,
        spaceScope: scope,
        readOnly: parsed.data.read_only ?? false,
      })
      .returning({
        id: apiTokens.id,
        name: apiTokens.name,
        tokenPrefix: apiTokens.tokenPrefix,
        spaceScope: apiTokens.spaceScope,
        readOnly: apiTokens.readOnly,
        createdAt: apiTokens.createdAt,
      });

    // `token` is returned ONCE — clients must copy it now.
    return NextResponse.json(
      { token: { ...row, plaintext } },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof ApiAuthError) return unauthorized(err.message);
    return serverError(err);
  }
}
