import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import {
  apiError,
  notFound,
  serverError,
  unauthorized,
} from "@/lib/api/errors";
import { ApiAuthError, requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { files } from "@/lib/db/schema";
import { limit, rateLimitResponse } from "@/lib/rate-limit";
import { reindexFile } from "@/lib/reindex";

export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

/**
 * Re-extract + re-embed a single file. Replaces any existing `file_chunks`.
 * Use case: older files imported before the PDF/DOCX extractor existed —
 * this fills them in without re-upload.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { ownerAccountId } = await requireSessionWithAccount();
    const { id } = await params;

    const rl = await limit("fileUpload", `u:${ownerAccountId}`);
    if (!rl.ok) return rateLimitResponse(rl);

    const [file] = await db
      .select()
      .from(files)
      .where(and(eq(files.id, id), eq(files.ownerAccountId, ownerAccountId)))
      .limit(1);
    if (!file) return notFound();

    const result = await reindexFile(file);
    if (result.status === "no_text") {
      return apiError(
        result.reason ?? "Kein Text extrahierbar. Binärdateien werden nicht indiziert.",
        400,
      );
    }
    if (result.status === "failed") {
      return serverError(new Error(result.reason ?? "Reindex failed"));
    }
    return NextResponse.json({ chunks: result.chunks });
  } catch (err) {
    if (err instanceof ApiAuthError) return unauthorized(err.message);
    console.error("[files.reindex]", err);
    return serverError(err);
  }
}
