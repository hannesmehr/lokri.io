import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  ApiAuthError,
  authErrorResponse,
  serverError,
  zodError,
} from "@/lib/api/errors";
import { requireAdminSession } from "@/lib/api/session";
import {
  getDAUTimeseries,
  getMRRTimeseries,
  getRevenueByMonth,
  getSignupsTimeseries,
} from "@/lib/admin/stats";

export const runtime = "nodejs";

const querySchema = z.object({
  type: z.enum(["signups", "mrr", "dau", "revenue"]),
  days: z.coerce.number().int().min(1).max(365).default(30),
  months: z.coerce.number().int().min(1).max(60).default(12),
});

/**
 * Alle Zeitreihen-Endpoints in einem Handler. `type` entscheidet über
 * die Loader-Funktion; TTL-Handling + Caching liegt im Stats-Service.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdminSession();
    const parsed = querySchema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams),
    );
    if (!parsed.success) return zodError(parsed.error);
    const { type, days, months } = parsed.data;

    if (type === "signups") {
      return NextResponse.json({ type, data: await getSignupsTimeseries(days) });
    }
    if (type === "dau") {
      return NextResponse.json({ type, data: await getDAUTimeseries(days) });
    }
    if (type === "mrr") {
      return NextResponse.json({ type, data: await getMRRTimeseries(months) });
    }
    if (type === "revenue") {
      return NextResponse.json({ type, data: await getRevenueByMonth(months) });
    }
    return NextResponse.json({ error: "Unknown type" }, { status: 400 });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[admin.stats.timeseries]", err);
    return serverError(err);
  }
}
