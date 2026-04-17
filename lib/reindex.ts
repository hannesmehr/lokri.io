import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { fileChunks, type files as filesTable } from "@/lib/db/schema";
import { chunkText, embedTexts } from "@/lib/embeddings";
import { getProviderForFile } from "@/lib/storage";
import { extractText } from "@/lib/text-extract";

export type ReindexStatus = "indexed" | "no_text" | "failed";

export interface ReindexResult {
  fileId: string;
  filename: string;
  status: ReindexStatus;
  chunks: number;
  reason?: string;
}

type FileRow = typeof filesTable.$inferSelect;

/**
 * Re-extract + re-embed a single file. Shared between the per-file route
 * (`/api/files/:id/reindex`) and the space-wide route
 * (`/api/spaces/:id/reindex`). Replaces existing `file_chunks` atomically
 * per-file: DELETE first, INSERT fresh. Non-throwing — callers can batch
 * without a try/catch.
 */
export async function reindexFile(file: FileRow): Promise<ReindexResult> {
  try {
    const provider = await getProviderForFile(file.storageProviderId);
    const { content } = await provider.get(file.storageKey);

    const text = await extractText(content, file.mimeType);
    if (!text || text.length === 0) {
      return {
        fileId: file.id,
        filename: file.filename,
        status: "no_text",
        chunks: 0,
        reason: `Kein Text extrahierbar (${file.mimeType}).`,
      };
    }

    const chunks = chunkText(text);
    await db.delete(fileChunks).where(eq(fileChunks.fileId, file.id));
    if (chunks.length === 0) {
      return {
        fileId: file.id,
        filename: file.filename,
        status: "indexed",
        chunks: 0,
      };
    }
    const { embeddings, model } = await embedTexts(chunks, file.ownerAccountId);
    await db.insert(fileChunks).values(
      chunks.map((c, i) => ({
        fileId: file.id,
        chunkIndex: i,
        contentText: c,
        embedding: embeddings[i],
        embeddingModel: model,
      })),
    );
    return {
      fileId: file.id,
      filename: file.filename,
      status: "indexed",
      chunks: chunks.length,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      fileId: file.id,
      filename: file.filename,
      status: "failed",
      chunks: 0,
      reason,
    };
  }
}
