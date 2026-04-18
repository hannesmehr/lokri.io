import { sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  ApiAuthError,
  authErrorResponse,
  serverError,
  zodError,
} from "@/lib/api/errors";
import { requireAdminSession } from "@/lib/api/session";
import { getCachedStats } from "@/lib/admin/stats-cache";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * Top-N Team-Accounts nach Seat-Count. Wird auf der Account-Stats-
 * Seite als Liste + optional als Histogramm-Input benutzt.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdminSession();
    const parsed = querySchema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams),
    );
    if (!parsed.success) return zodError(parsed.error);
    const { limit } = parsed.data;

    const data = await getCachedStats(`top.teams.${limit}`, 300, async () => {
      const result = await db.execute(sql`
        SELECT oa.id AS owner_account_id,
               oa.name,
               count(m.id)::int AS seats,
               oa.plan_id
        FROM owner_accounts oa
        LEFT JOIN owner_account_members m ON m.owner_account_id = oa.id
        WHERE oa.type = 'team'
        GROUP BY oa.id, oa.name, oa.plan_id
        ORDER BY seats DESC NULLS LAST
        LIMIT ${limit}
      `);
      const rows = Array.isArray(result)
        ? (result as Array<Record<string, unknown>>)
        : ((result as { rows?: unknown[] }).rows as Array<Record<string, unknown>>) ?? [];
      return rows.map((r) => ({
        ownerAccountId: String(r.owner_account_id),
        name: String(r.name),
        seats: Number(r.seats ?? 0),
        planId: String(r.plan_id),
      }));
    });

    return NextResponse.json({ data });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[admin.stats.top-teams]", err);
    return serverError(err);
  }
}
