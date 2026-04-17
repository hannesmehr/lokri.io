import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { notFound, serverError, unauthorized } from "@/lib/api/errors";
import { ApiAuthError, requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { files, spaces } from "@/lib/db/schema";
import { limit, rateLimitResponse } from "@/lib/rate-limit";
import { reindexFile, type ReindexResult } from "@/lib/reindex";

export const runtime = "nodejs";
export const maxDuration = 300; // up to 5 min for big spaces

type Params = { params: Promise<{ id: string }> };

/** Hard cap so a single call can't melt the AI Gateway budget. */
const MAX_FILES_PER_CALL = 100;

/**
 * Re-extract + re-embed every file in a space. Sequential — we want
 * predictable quota/cost accounting and avoid hammering the AI Gateway.
 * Files without extractable text (images, archives, empty PDFs) are
 * reported as `no_text` and their chunks stay untouched.
 *
 * If the space has more than `MAX_FILES_PER_CALL` files, only the most
 * recently created batch is processed; the response's `truncated` flag
 * signals to the client that another call is needed.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { ownerAccountId } = await requireSessionWithAccount();
    const { id } = await params;

    const rl = await limit("reindex", `u:${ownerAccountId}`);
    if (!rl.ok) return rateLimitResponse(rl);

    const [space] = await db
      .select({ id: spaces.id })
      .from(spaces)
      .where(and(eq(spaces.id, id), eq(spaces.ownerAccountId, ownerAccountId)))
      .limit(1);
    if (!space) return notFound();

    const spaceFiles = await db
      .select()
      .from(files)
      .where(
        and(
          eq(files.ownerAccountId, ownerAccountId),
          eq(files.spaceId, id),
        ),
      )
      .limit(MAX_FILES_PER_CALL + 1);

    const truncated = spaceFiles.length > MAX_FILES_PER_CALL;
    const batch = truncated ? spaceFiles.slice(0, MAX_FILES_PER_CALL) : spaceFiles;

    const results: ReindexResult[] = [];
    for (const f of batch) {
      results.push(await reindexFile(f));
    }

    const summary = {
      total: results.length,
      indexed: results.filter((r) => r.status === "indexed").length,
      noText: results.filter((r) => r.status === "no_text").length,
      failed: results.filter((r) => r.status === "failed").length,
      chunks: results.reduce((n, r) => n + r.chunks, 0),
      truncated,
    };

    return NextResponse.json({ summary, results });
  } catch (err) {
    if (err instanceof ApiAuthError) return unauthorized(err.message);
    console.error("[spaces.reindex]", err);
    return serverError(err);
  }
}
