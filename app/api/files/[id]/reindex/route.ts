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
import { fileChunks, files } from "@/lib/db/schema";
import { chunkText, embedTexts } from "@/lib/embeddings";
import { limit, rateLimitResponse } from "@/lib/rate-limit";
import { getProviderForFile } from "@/lib/storage";
import { extractText } from "@/lib/text-extract";

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

    const provider = await getProviderForFile(file.storageProviderId);
    const { content } = await provider.get(file.storageKey);

    const text = await extractText(content, file.mimeType);
    if (!text || text.length === 0) {
      return apiError(
        `Kein Text extrahierbar (${file.mimeType}). Binärdateien werden nicht indiziert.`,
        400,
      );
    }

    // Replace existing chunks.
    await db.delete(fileChunks).where(eq(fileChunks.fileId, file.id));

    const chunks = chunkText(text);
    if (chunks.length === 0) {
      return NextResponse.json({ chunks: 0 });
    }
    const { embeddings, model } = await embedTexts(chunks);
    await db.insert(fileChunks).values(
      chunks.map((c, i) => ({
        fileId: file.id,
        chunkIndex: i,
        contentText: c,
        embedding: embeddings[i],
        embeddingModel: model,
      })),
    );

    return NextResponse.json({ chunks: chunks.length });
  } catch (err) {
    if (err instanceof ApiAuthError) return unauthorized(err.message);
    console.error("[files.reindex]", err);
    return serverError(err);
  }
}
