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
 * Postgres-Tabellen-Metriken via `pg_total_relation_size`. Liefert Größe
 * + Zeilen-Approximation (pg_stat reltuples, nicht exakt) pro Tabelle
 * aus einer whitelisted Liste — wir wollen keine System-Tabellen in
 * der Übersicht haben.
 */
const INTERESTING_TABLES = [
  "users",
  "sessions",
  "owner_accounts",
  "owner_account_members",
  "api_tokens",
  "spaces",
  "files",
  "file_chunks",
  "notes",
  "orders",
  "invoices",
  "audit_events",
  "team_invites",
  "usage_quota",
];

export async function GET() {
  try {
    await requireAdminSession();
    const data = await getCachedStats("system.db-metrics", 300, async () => {
      const result = await db.execute(sql`
        SELECT relname AS table_name,
               pg_total_relation_size('public.' || relname)::bigint AS total_bytes,
               reltuples::bigint AS approx_rows
        FROM pg_class
        WHERE relname = ANY(${INTERESTING_TABLES})
        ORDER BY total_bytes DESC
      `);
      const rows = Array.isArray(result)
        ? (result as Array<Record<string, unknown>>)
        : ((result as { rows?: unknown[] }).rows as Array<Record<string, unknown>>) ?? [];
      return rows.map((r) => ({
        table: String(r.table_name),
        totalBytes: Number(r.total_bytes ?? 0),
        approxRows: Number(r.approx_rows ?? 0),
      }));
    });
    return NextResponse.json({ tables: data });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[admin.system.db-metrics]", err);
    return serverError(err);
  }
}
