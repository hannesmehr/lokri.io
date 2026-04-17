import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  notFound,
  parseJsonBody,
  serverError,
  unauthorized,
  zodError,
} from "@/lib/api/errors";
import { ApiAuthError, requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { spaces } from "@/lib/db/schema";
import { limit, rateLimitResponse } from "@/lib/rate-limit";
import { importExternalKey, type ImportResult } from "@/lib/space-import";
import { loadBrowsableProvider } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Bulk-import external keys in one request. Keys ending with `/` are treated
 * as DIRECTORY prefixes and expanded recursively on the server — one click
 * on a folder can fan out into up to `MAX_EXPANDED_FILES` individual
 * imports. Sequential processing (keeps quota accounting simple + avoids
 * hammering the AI Gateway). First `skipped_quota` short-circuits the
 * remaining keys so the user sees a clear "stopped at file N" story.
 */
const MAX_KEYS_PER_BATCH = 50; // raw keys a client may send
const MAX_EXPANDED_FILES = 200; // after expanding all directory prefixes

const bodySchema = z.object({
  keys: z
    .array(z.string().min(1).max(1500))
    .min(1)
    .max(MAX_KEYS_PER_BATCH),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { ownerAccountId } = await requireSessionWithAccount();
    const { id } = await params;

    // Same rate-limit bucket as the single-file import path — a batch
    // call counts as one bucket hit, not N. That's a deliberate trade-off:
    // we want to allow legit bulk imports without the user having to wait
    // 1/min per file, but we cap batch size via MAX_KEYS_PER_BATCH above.
    const rl = await limit("fileUpload", `u:${ownerAccountId}`);
    if (!rl.ok) return rateLimitResponse(rl);

    const body = await parseJsonBody(req, 64 * 1024);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const [space] = await db
      .select({
        id: spaces.id,
        storageProviderId: spaces.storageProviderId,
      })
      .from(spaces)
      .where(and(eq(spaces.id, id), eq(spaces.ownerAccountId, ownerAccountId)))
      .limit(1);
    if (!space || !space.storageProviderId) return notFound();

    const { provider } = await loadBrowsableProvider(
      ownerAccountId,
      space.storageProviderId,
    );
    const ctx = {
      ownerAccountId,
      spaceId: space.id,
      providerId: space.storageProviderId,
      provider,
      rootPrefix: provider.rootPrefix,
    };

    // Expand directory prefixes (trailing "/") into flat key lists via
    // S3's recursive listing. Dedup at each step so the same object in a
    // raw key + a directory it's inside only imports once.
    const expanded = new Set<string>();
    let truncatedExpansion = false;
    for (const raw of parsed.data.keys) {
      if (expanded.size >= MAX_EXPANDED_FILES) {
        truncatedExpansion = true;
        break;
      }
      if (raw.endsWith("/")) {
        const remaining = MAX_EXPANDED_FILES - expanded.size;
        const { objects, truncatedAt } = await provider.listRecursive(raw, remaining);
        for (const o of objects) expanded.add(o.key);
        if (truncatedAt) truncatedExpansion = true;
      } else {
        expanded.add(raw);
      }
    }

    const results: ImportResult[] = [];
    let quotaExhausted = false;

    for (const key of expanded) {
      if (quotaExhausted) {
        results.push({
          key,
          status: "skipped_quota",
          reason: "Quota wurde vorher erreicht — keine weiteren Imports.",
        });
        continue;
      }
      const r = await importExternalKey(ctx, key);
      results.push(r);
      if (r.status === "skipped_quota") quotaExhausted = true;
    }

    const summary = {
      total: results.length,
      imported: results.filter((r) => r.status === "imported").length,
      alreadyImported: results.filter((r) => r.status === "already_imported")
        .length,
      skippedQuota: results.filter((r) => r.status === "skipped_quota").length,
      failed: results.filter((r) => r.status === "failed").length,
      truncatedExpansion,
    };

    return NextResponse.json({ summary, results });
  } catch (err) {
    if (err instanceof ApiAuthError) return unauthorized(err.message);
    console.error("[external.import-batch]", err);
    return serverError(err);
  }
}
