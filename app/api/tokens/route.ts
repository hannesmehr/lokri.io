import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  apiError,
  authErrorResponse,
  forbidden,
  parseJsonBody,
  serverError,
  zodError,
} from "@/lib/api/errors";
import { ApiAuthError, requireSessionWithAccount } from "@/lib/api/session";
import { canCreateTeamTokens } from "@/lib/auth/roles";
import { logAuditEvent } from "@/lib/audit/log";
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
  /**
   * `personal` (default) — token is bound to the creating user and dies
   * with their membership. `team` — account-scoped, survives member churn
   * (only owner/admin may create).
   */
  scope_type: z.enum(["personal", "team"]).optional().default("personal"),
});

export async function GET() {
  try {
    const { ownerAccountId } = await requireSessionWithAccount();

    const rows = await db
      .select({
        id: apiTokens.id,
        name: apiTokens.name,
        tokenPrefix: apiTokens.tokenPrefix,
        scopeType: apiTokens.scopeType,
        createdByUserId: apiTokens.createdByUserId,
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
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    return serverError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { ownerAccountId, session, role, accountType } =
      await requireSessionWithAccount();
    const rl = await limit("tokenCreate", `u:${ownerAccountId}`);
    if (!rl.ok) return rateLimitResponse(rl);

    const json = await parseJsonBody(req, 16 * 1024);
    const parsed = createBodySchema.safeParse(json);
    if (!parsed.success) return zodError(parsed.error);

    // Only team-accounts have the "team" scope notion — on personal
    // accounts we silently coerce to `personal`.
    const scopeType: "personal" | "team" =
      accountType === "team" ? parsed.data.scope_type : "personal";
    if (scopeType === "team" && !canCreateTeamTokens(role)) {
      return forbidden("Only owner/admin may create team-wide tokens.");
    }

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
          "One or more space ids do not belong to this account.",
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
        scopeType,
        // Personal tokens are tied to the creator for member-removal
        // clean-up. Team tokens leave this null so removing the creator
        // doesn't accidentally nuke a team-wide token.
        createdByUserId: scopeType === "personal" ? session.user.id : null,
        spaceScope: scope,
        readOnly: parsed.data.read_only ?? false,
      })
      .returning({
        id: apiTokens.id,
        name: apiTokens.name,
        tokenPrefix: apiTokens.tokenPrefix,
        scopeType: apiTokens.scopeType,
        spaceScope: apiTokens.spaceScope,
        readOnly: apiTokens.readOnly,
        createdAt: apiTokens.createdAt,
      });

    await logAuditEvent({
      ownerAccountId,
      actorUserId: session.user.id,
      action: "token.created",
      targetType: "token",
      targetId: row.id,
      metadata: {
        name: row.name,
        scopeType: row.scopeType,
        readOnly: row.readOnly ?? false,
        spaceScopeCount: scope?.length ?? 0,
      },
    });

    return NextResponse.json(
      { token: { ...row, plaintext } },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    return serverError(err);
  }
}
