import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { fileChunks, files } from "@/lib/db/schema";
import { chunkText, embedTexts } from "@/lib/embeddings";
import { mimeTypeFromFilename } from "@/lib/mime";
import { applyQuotaDelta, checkQuota } from "@/lib/quota";
import type { S3Provider } from "@/lib/storage/s3";
import { extractText } from "@/lib/text-extract";

export type ImportStatus =
  | "imported"
  | "already_imported"
  | "skipped_quota"
  | "failed";

export interface ImportResult {
  key: string;
  status: ImportStatus;
  fileId?: string;
  reason?: string;
}

export interface ImportContext {
  ownerAccountId: string;
  spaceId: string;
  providerId: string;
  s3: S3Provider;
  /** Provider's path prefix — used to build absolute `storage_key`. */
  rootPrefix: string;
}

/**
 * Import a single external object into lokri. Shared by single-import and
 * batch-import endpoints. Idempotent on `(providerId, storageKey)`.
 *
 * `skipped_quota` if the file doesn't fit — caller can stop the batch at
 * that point since further imports will hit the same cap.
 */
export async function importExternalKey(
  ctx: ImportContext,
  relativeKey: string,
): Promise<ImportResult> {
  const rootPrefix = ctx.rootPrefix.replace(/^\/+|\/+$/g, "");
  const storageKey = rootPrefix
    ? `${rootPrefix}/${relativeKey}`
    : relativeKey;

  // Idempotency check — same account + provider + key already materialized.
  const [existing] = await db
    .select({ id: files.id })
    .from(files)
    .where(
      and(
        eq(files.ownerAccountId, ctx.ownerAccountId),
        eq(files.storageProviderId, ctx.providerId),
        eq(files.storageKey, storageKey),
      ),
    )
    .limit(1);
  if (existing) {
    return { key: relativeKey, status: "already_imported", fileId: existing.id };
  }

  try {
    const { content, mimeType: detectedMime } =
      await ctx.s3.getByRelativeKey(relativeKey);
    const filename = relativeKey.split("/").pop() || relativeKey;
    const mime = detectedMime ?? mimeTypeFromFilename(filename);

    const quota = await checkQuota(ctx.ownerAccountId, {
      bytes: content.byteLength,
      files: 1,
    });
    if (!quota.ok) {
      return {
        key: relativeKey,
        status: "skipped_quota",
        reason: quota.reason,
      };
    }

    const [row] = await db
      .insert(files)
      .values({
        ownerAccountId: ctx.ownerAccountId,
        spaceId: ctx.spaceId,
        filename,
        mimeType: mime,
        sizeBytes: content.byteLength,
        storageProviderId: ctx.providerId,
        storageKey,
      })
      .returning({ id: files.id });

    try {
      const text = await extractText(content, mime);
      if (text && text.length > 0) {
        const chunks = chunkText(text);
        if (chunks.length > 0) {
          const { embeddings, model } = await embedTexts(chunks);
          await db.insert(fileChunks).values(
            chunks.map((c, i) => ({
              fileId: row.id,
              chunkIndex: i,
              contentText: c,
              embedding: embeddings[i],
              embeddingModel: model,
            })),
          );
        }
      }
    } catch (err) {
      // Non-fatal: file is stored, just not embedded. Admin can re-index.
      console.error(
        `[space-import] embedding failed for ${row.id} (${relativeKey}):`,
        err,
      );
    }

    await applyQuotaDelta(ctx.ownerAccountId, {
      bytes: content.byteLength,
      files: 1,
    });

    return { key: relativeKey, status: "imported", fileId: row.id };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Unknown error";
    return { key: relativeKey, status: "failed", reason };
  }
}
