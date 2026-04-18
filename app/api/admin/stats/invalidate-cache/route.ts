import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  ApiAuthError,
  authErrorResponse,
  parseJsonBody,
  serverError,
} from "@/lib/api/errors";
import { requireAdminSession } from "@/lib/api/session";
import { invalidateStatsCache } from "@/lib/admin/stats-cache";

export const runtime = "nodejs";

const bodySchema = z
  .object({
    prefix: z.string().trim().max(80).optional(),
  })
  .default({});

/**
 * Manueller Cache-Invalidation-Trigger. Wird vom Dashboard-Refresh-
 * Button aufgerufen. Ohne `prefix` wird alles gepurged — gut genug für
 * unsere kleine Cache-Menge.
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdminSession();
    const body = await parseJsonBody(req);
    const parsed = bodySchema.safeParse(body ?? {});
    const prefix = parsed.success ? parsed.data.prefix : undefined;
    const cleared = invalidateStatsCache(prefix);
    return NextResponse.json({ ok: true, cleared });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[admin.stats.invalidate-cache]", err);
    return serverError(err);
  }
}
