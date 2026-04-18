import { NextResponse } from "next/server";
import {
  ApiAuthError,
  authErrorResponse,
  serverError,
} from "@/lib/api/errors";
import { requireAdminSession } from "@/lib/api/session";
import {
  getAccountStats,
  getBusinessStats,
  getSystemStats,
  getUserStats,
} from "@/lib/admin/stats";

export const runtime = "nodejs";

/**
 * Aggregated KPIs für die Dashboard-Home. Greift auf `getCachedStats`
 * zurück — alle vier Abfragen parallel, total-Roundtrip ≈ Max der
 * einzelnen Queries.
 */
export async function GET() {
  try {
    await requireAdminSession();
    const [users, accounts, business, system] = await Promise.all([
      getUserStats(),
      getAccountStats(),
      getBusinessStats(),
      getSystemStats(),
    ]);
    return NextResponse.json({
      users,
      accounts,
      business,
      system,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[admin.stats.kpis]", err);
    return serverError(err);
  }
}
