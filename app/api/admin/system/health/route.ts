import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import {
  ApiAuthError,
  authErrorResponse,
  serverError,
} from "@/lib/api/errors";
import { requireAdminSession } from "@/lib/api/session";
import { getCachedStats } from "@/lib/admin/stats-cache";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Aggregierter Gesundheitsstatus.
 *
 * Keys in der Response sind so gewählt, dass die Client-Komponente sie
 * direkt auf Sektions-Cards mappen kann (paypal/storage/embedding/
 * sessions/invites).
 */
export async function GET() {
  try {
    await requireAdminSession();
    const data = await getCachedStats("system.health", 60, async () => {
      const result = await db.execute(sql`
        SELECT
          (SELECT count(*)::int FROM orders
             WHERE status = 'created'
               AND created_at < now() - interval '1 hour') AS paypal_stale_created,
          (SELECT count(*)::int FROM orders
             WHERE status = 'failed') AS paypal_failed,
          (SELECT count(*)::int FROM orders
             WHERE status = 'captured'
               AND NOT EXISTS (
                 SELECT 1 FROM invoices i WHERE i.order_id = orders.id
               )) AS paypal_captured_no_invoice,
          (SELECT count(*)::int FROM storage_providers) AS storage_providers_total,
          (SELECT count(*)::int FROM embedding_keys) AS embedding_keys_total,
          (SELECT count(*)::int FROM sessions
             WHERE expires_at < now()) AS sessions_expired,
          (SELECT count(*)::int FROM team_invites
             WHERE accepted_at IS NULL
               AND revoked_at IS NULL
               AND expires_at < now()) AS invites_stale,
          (SELECT count(*)::int FROM users
             WHERE preferred_locale IS NULL) AS users_missing_locale,
          (SELECT count(*)::int FROM api_tokens
             WHERE revoked_at IS NULL) AS tokens_active
      `);
      const rows = Array.isArray(result)
        ? (result as Array<Record<string, unknown>>)
        : ((result as { rows?: unknown[] }).rows as Array<Record<string, unknown>>) ?? [];
      const row = rows[0] ?? {};
      const num = (v: unknown): number =>
        typeof v === "number" ? v : Number(v ?? 0);
      return {
        paypal: {
          staleCreated: num(row.paypal_stale_created),
          failed: num(row.paypal_failed),
          capturedWithoutInvoice: num(row.paypal_captured_no_invoice),
        },
        storage: {
          providersTotal: num(row.storage_providers_total),
        },
        embedding: {
          byokKeysTotal: num(row.embedding_keys_total),
        },
        sessions: {
          expired: num(row.sessions_expired),
        },
        invites: {
          stale: num(row.invites_stale),
        },
        users: {
          missingLocale: num(row.users_missing_locale),
        },
        tokens: {
          activeTotal: num(row.tokens_active),
        },
        fetchedAt: new Date().toISOString(),
      };
    });
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[admin.system.health]", err);
    return serverError(err);
  }
}
