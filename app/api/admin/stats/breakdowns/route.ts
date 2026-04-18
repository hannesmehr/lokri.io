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
  getAccountStats,
  getSystemStats,
  getTopAccountsByStorage,
  getTopRevenueAccounts,
} from "@/lib/admin/stats";

export const runtime = "nodejs";

const querySchema = z.object({
  type: z.enum([
    "storage-by-provider",
    "accounts-by-plan",
    "top-storage",
    "top-revenue",
  ]),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export async function GET(req: NextRequest) {
  try {
    await requireAdminSession();
    const parsed = querySchema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams),
    );
    if (!parsed.success) return zodError(parsed.error);
    const { type, limit } = parsed.data;

    if (type === "storage-by-provider") {
      const sys = await getSystemStats();
      return NextResponse.json({
        type,
        data: Object.entries(sys.storageByProvider).map(([provider, bytes]) => ({
          provider,
          bytes,
        })),
      });
    }
    if (type === "accounts-by-plan") {
      const s = await getAccountStats();
      return NextResponse.json({
        type,
        data: Object.entries(s.teamAccountsByPlan).map(([plan, count]) => ({
          plan,
          count,
        })),
      });
    }
    if (type === "top-storage") {
      return NextResponse.json({
        type,
        data: await getTopAccountsByStorage(limit),
      });
    }
    if (type === "top-revenue") {
      return NextResponse.json({
        type,
        data: await getTopRevenueAccounts(limit),
      });
    }
    return NextResponse.json({ error: "Unknown type" }, { status: 400 });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[admin.stats.breakdowns]", err);
    return serverError(err);
  }
}
