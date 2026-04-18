import { and, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  ApiAuthError,
  apiError,
  authErrorResponse,
  parseJsonBody,
  serverError,
  zodError,
} from "@/lib/api/errors";
import { requireAdminSession } from "@/lib/api/session";
import { logAuditEvent } from "@/lib/audit/log";
import { db } from "@/lib/db";
import { apiTokens } from "@/lib/db/schema";

export const runtime = "nodejs";

const bulkSchema = z.object({
  mode: z.enum(["dryRun", "apply"]),
  /** "Inaktiv" = kein `last_used_at` bzw. älter als N Tage + Token ebenfalls >N Tage alt. */
  inactiveDays: z.number().int().min(7).max(3650).default(180),
  /** "Unused" = nie benutzt, Token älter als N Tage. */
  unusedOlderThanDays: z.number().int().min(7).max(3650).default(90),
});

/**
 * Bulk-Revoke inaktiver Tokens.
 *
 * Zwei Heuristiken werden kombiniert:
 *   1. Ein Token mit `last_used_at < now() - inactiveDays`
 *      → wurde benutzt, aber lange nicht mehr → revoken.
 *   2. Ein Token mit `last_used_at IS NULL` und
 *      `created_at < now() - unusedOlderThanDays`
 *      → wurde nie benutzt und liegt lange herum → revoken.
 *
 * Revoked = `revokedAt = now()`. Kein Löschen, damit Audit-Traces stabil
 * bleiben.
 *
 * `dryRun` zählt nur. `apply` zählt, revoked und schreibt EIN zentrales
 * `admin.bulk.tokens_revoked` Audit-Event (ohne Owner-Account-Scoping,
 * weil systemweit — daher direktes `logAuditEvent`-Call mit dem System-
 * Owner-Account-Platzhalter; siehe Implementierungs-Notizen).
 */
export async function POST(req: NextRequest) {
  try {
    const { userId: actorId } = await requireAdminSession();
    const body = await parseJsonBody(req);
    const parsed = bulkSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);
    const { mode, inactiveDays, unusedOlderThanDays } = parsed.data;

    const now = Date.now();
    const inactiveCutoff = new Date(now - inactiveDays * 24 * 60 * 60 * 1000);
    const unusedCutoff = new Date(now - unusedOlderThanDays * 24 * 60 * 60 * 1000);

    const matcher = and(
      isNull(apiTokens.revokedAt),
      or(
        and(isNotNull(apiTokens.lastUsedAt), lt(apiTokens.lastUsedAt, inactiveCutoff)),
        and(isNull(apiTokens.lastUsedAt), lt(apiTokens.createdAt, unusedCutoff)),
      ),
    );

    if (mode === "dryRun") {
      const [{ n }] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(apiTokens)
        .where(matcher);
      return NextResponse.json({
        ok: true,
        mode: "dryRun",
        wouldRevoke: Number(n),
        params: { inactiveDays, unusedOlderThanDays },
      });
    }

    // Apply: Revoke in-place, RETURNING für die Audit-Info.
    const revoked = await db
      .update(apiTokens)
      .set({ revokedAt: new Date() })
      .where(matcher)
      .returning({
        id: apiTokens.id,
        ownerAccountId: apiTokens.ownerAccountId,
        name: apiTokens.name,
      });

    // System-Audit: wir schreiben EIN Event pro betroffenen Owner-Account,
    // damit die Accounts ihre eigene Audit-Spur vollständig sehen. Der
    // Overhead ist okay (typisch 1-2 Events pro Run in der Praxis).
    const byAccount = new Map<string, Array<{ id: string; name: string }>>();
    for (const r of revoked) {
      const list = byAccount.get(r.ownerAccountId) ?? [];
      list.push({ id: r.id, name: r.name });
      byAccount.set(r.ownerAccountId, list);
    }

    await Promise.all(
      [...byAccount.entries()].map(([ownerAccountId, tokens]) =>
        logAuditEvent({
          ownerAccountId,
          actorUserId: actorId,
          action: "admin.bulk.tokens_revoked",
          targetType: "api_token",
          metadata: {
            count: tokens.length,
            tokens,
            params: { inactiveDays, unusedOlderThanDays },
          },
        }),
      ),
    );

    return NextResponse.json({
      ok: true,
      mode: "apply",
      revoked: revoked.length,
      params: { inactiveDays, unusedOlderThanDays },
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[admin.tokens.bulk-revoke-inactive]", err);
    return serverError(err);
  }
}

// Reference for future callers.
void apiError;
