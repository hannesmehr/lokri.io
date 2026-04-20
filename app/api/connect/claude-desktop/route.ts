/**
 * `POST /api/connect/claude-desktop`
 *
 * Erzeugt ein personal-scoped `api_tokens`-Row für den Setup-Wizard
 * unter `/connect/claude-desktop`. Dünne Dedicated-Route parallel zu
 * `/api/tokens`:
 *
 *   - Fest `scope_type: 'personal'` — der Wizard ist explizit auf
 *     Personal-Tokens fokussiert. Team-Tokens laufen weiter über
 *     `/api/tokens` (Advanced-UI unter `/settings/mcp`).
 *   - Kein Expiry (matched bestehendes Schema; Phase-2-Feature).
 *   - Eigener Audit-Event `user.connect.token_created` mit
 *     `clientType`-Metadata — ermöglicht Block-3-LEFT-JOIN auf
 *     `audit_events`, um die „Erstellt via"-Spalte in der Token-UI
 *     aufzufüllen, ohne Schema-Migration.
 *
 * Rate-Limit: bestehender `tokenCreate`-Bucket (10/1h/User).
 */

import { NextResponse, type NextRequest } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  ApiAuthError,
  apiError,
  authErrorResponse,
  parseJsonBody,
  serverError,
  zodError,
} from "@/lib/api/errors";
import { requireSessionWithAccount } from "@/lib/api/session";
import { logAuditEvent } from "@/lib/audit/log";
import { db } from "@/lib/db";
import { apiTokens, spaces } from "@/lib/db/schema";
import { limit, rateLimitResponse } from "@/lib/rate-limit";
import { generateApiToken } from "@/lib/tokens";

export const runtime = "nodejs";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  scope: z.discriminatedUnion("type", [
    z.object({ type: z.literal("all") }),
    z.object({
      type: z.literal("spaces"),
      spaceIds: z.array(z.string().uuid()).min(1).max(50),
    }),
  ]),
  readOnly: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  try {
    const { ownerAccountId, session } = await requireSessionWithAccount({
      minRole: "member",
    });

    const rl = await limit("tokenCreate", `u:${ownerAccountId}`);
    if (!rl.ok) return rateLimitResponse(rl);

    const json = await parseJsonBody(req, 16 * 1024);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) return zodError(parsed.error);
    const input = parsed.data;

    // Space-Scope-Validierung: nur Spaces des eigenen Accounts.
    let scope: string[] | null = null;
    if (input.scope.type === "spaces") {
      const ids = [...new Set(input.scope.spaceIds)];
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
        name: input.name,
        tokenHash: hash,
        tokenPrefix: prefix,
        scopeType: "personal",
        createdByUserId: session.user.id,
        spaceScope: scope,
        readOnly: input.readOnly,
      })
      .returning({
        id: apiTokens.id,
        name: apiTokens.name,
        tokenPrefix: apiTokens.tokenPrefix,
        createdAt: apiTokens.createdAt,
      });

    // Zwei Audit-Events:
    //  - `token.created`: matched das normale Token-Create-Pattern
    //    (Token-UI + Admin-Panel lesen daraus)
    //  - `user.connect.token_created`: dedicated, mit clientType —
    //    das ermöglicht die „Erstellt via"-Spalte ohne DB-Migration
    await Promise.all([
      logAuditEvent({
        ownerAccountId,
        actorUserId: session.user.id,
        action: "token.created",
        targetType: "token",
        targetId: row.id,
        metadata: {
          name: row.name,
          scopeType: "personal",
          readOnly: input.readOnly,
          spaceScopeCount: scope?.length ?? 0,
        },
      }),
      logAuditEvent({
        ownerAccountId,
        actorUserId: session.user.id,
        action: "user.connect.token_created",
        targetType: "token",
        targetId: row.id,
        metadata: {
          clientType: "claude-desktop",
          readOnly: input.readOnly,
          scopeType: input.scope.type,
          spaceScopeCount: scope?.length ?? 0,
        },
      }),
    ]);

    return NextResponse.json(
      {
        token: {
          id: row.id,
          name: row.name,
          tokenPrefix: row.tokenPrefix,
          plaintext,
          createdAt: row.createdAt,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    return serverError(err);
  }
}
