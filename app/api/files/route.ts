import { and, desc, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  apiError,
  paymentRequired,
  serverError,
  tooLarge,
  unauthorized,
  zodError,
} from "@/lib/api/errors";
import { findOwnedSpace } from "@/lib/api/ownership";
import { ApiAuthError, requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { fileChunks, files } from "@/lib/db/schema";
import { chunkText, embedTexts } from "@/lib/embeddings";
import { reserveQuota } from "@/lib/quota";
import { limit, rateLimitResponse } from "@/lib/rate-limit";
import { getProviderForNewUpload } from "@/lib/storage";
import { extractText } from "@/lib/text-extract";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB per file (spec)

const listQuerySchema = z.object({
  spaceId: z.uuid().optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export async function GET(req: NextRequest) {
  try {
    const { ownerAccountId } = await requireSessionWithAccount();
    const parsed = listQuerySchema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams),
    );
    if (!parsed.success) return zodError(parsed.error);

    const conditions = [eq(files.ownerAccountId, ownerAccountId)];
    if (parsed.data.spaceId) {
      conditions.push(eq(files.spaceId, parsed.data.spaceId));
    }

    const rows = await db
      .select()
      .from(files)
      .where(and(...conditions))
      .orderBy(desc(files.createdAt))
      .limit(parsed.data.limit);

    return NextResponse.json({ files: rows });
  } catch (err) {
    if (err instanceof ApiAuthError) return unauthorized(err.message);
    return serverError(err);
  }
}

/**
 * Upload via `multipart/form-data`:
 *   - `file`: the File
 *   - `space_id`: optional UUID
 *
 * Text-like content (`text/*` or `application/json`) is chunked + embedded so
 * it shows up in `/api/search`. Binary content is stored without chunks.
 */
export async function POST(req: NextRequest) {
  try {
    const { ownerAccountId } = await requireSessionWithAccount();
    const rl = await limit("fileUpload", `u:${ownerAccountId}`);
    if (!rl.ok) return rateLimitResponse(rl);

    const ctype = req.headers.get("content-type") ?? "";
    if (!ctype.startsWith("multipart/form-data")) {
      return apiError("Expected multipart/form-data upload.", 415);
    }

    const form = await req.formData();
    const file = form.get("file");
    const spaceIdRaw = form.get("space_id");
    const spaceId = typeof spaceIdRaw === "string" && spaceIdRaw.length > 0 ? spaceIdRaw : null;
    const targetPrefixRaw = form.get("target_prefix");
    const targetPrefix =
      typeof targetPrefixRaw === "string" ? targetPrefixRaw : undefined;

    if (!(file instanceof File)) {
      return apiError("Missing `file` field.", 400);
    }
    if (file.size === 0) return apiError("Empty file.", 400);
    if (file.size > MAX_FILE_BYTES) {
      return tooLarge(
        `File exceeds per-file limit of ${MAX_FILE_BYTES} bytes.`,
      );
    }

    if (spaceId) {
      if (!z.uuid().safeParse(spaceId).success) {
        return apiError("Invalid `space_id`.", 400);
      }
      const space = await findOwnedSpace(ownerAccountId, spaceId);
      if (!space) return apiError("Space not found", 404);
    }

    const content = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || "application/octet-stream";
    const { provider, providerId } = await getProviderForNewUpload(
      ownerAccountId,
      spaceId,
    );

    const putResult = await provider.put({
      ownerAccountId,
      filename: file.name,
      content,
      mimeType,
      targetPrefix,
    });

    try {
      // When `target_prefix` is provided (D&D), the storage key is determin-
      // istic — if the user drops the same filename twice, S3 overwrites
      // the object, and we must likewise replace the DB row to avoid
      // ghost duplicates. `fileChunks` is ON DELETE CASCADE so old chunks
      // vanish with the old row. Quota correction via negative delta.
      const row = await db.transaction(async (tx) => {
        let existingFreedBytes = 0;
        let existingFreedFiles = 0;
        if (providerId && targetPrefix !== undefined) {
          const existing = await tx
            .select({ id: files.id, sizeBytes: files.sizeBytes })
            .from(files)
            .where(
              and(
                eq(files.ownerAccountId, ownerAccountId),
                eq(files.storageProviderId, providerId),
                eq(files.storageKey, putResult.storageKey),
              ),
            );
          if (existing.length > 0) {
            await tx.delete(files).where(
              and(
                eq(files.ownerAccountId, ownerAccountId),
                eq(files.storageProviderId, providerId),
                eq(files.storageKey, putResult.storageKey),
              ),
            );
            existingFreedBytes = existing.reduce((n, r) => n + r.sizeBytes, 0);
            existingFreedFiles = existing.length;
          }
        }

        const quotaCheck = await reserveQuota(
          ownerAccountId,
          {
            bytes: putResult.sizeBytes - existingFreedBytes,
            files: 1 - existingFreedFiles,
          },
          tx,
        );
        if (!quotaCheck.ok) throw new Error(`QUOTA:${quotaCheck.reason}`);

        const [created] = await tx
          .insert(files)
          .values({
            ownerAccountId,
            spaceId,
            filename: file.name,
            mimeType,
            sizeBytes: putResult.sizeBytes,
            storageProviderId: providerId,
            storageKey: putResult.storageKey,
          })
          .returning();

        return created;
      });

      // Text extraction — handles text/*, JSON, PDF, DOCX. Non-extractable
      // types (images, archives) are stored without chunks.
      try {
        const text = await extractText(content, mimeType);
        if (text && text.length > 0) {
          const chunks = chunkText(text);
          if (chunks.length > 0) {
            const { embeddings, model } = await embedTexts(chunks, ownerAccountId);
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
      } catch (embedErr) {
        // Don't fail the upload if extraction/embedding fails — log and
        // continue. File stays stored + listable; future re-index job can
        // pick it up.
        console.error(
          `[api/files] extract/embed failed for ${row.id}, stored without chunks:`,
          embedErr,
        );
      }

      // No public URL — clients download via `/api/files/<id>/content`, which
      // proxies through this server after an ownership check.
      return NextResponse.json({ file: row }, { status: 201 });
    } catch (err) {
      await provider.delete(putResult.storageKey).catch((cleanupErr) => {
        console.error(
          `[api/files] cleanup failed for orphaned object ${putResult.storageKey}:`,
          cleanupErr,
        );
      });
      if (err instanceof Error && err.message.startsWith("QUOTA:")) {
        return paymentRequired(err.message.slice("QUOTA:".length));
      }
      throw err;
    }
  } catch (err) {
    if (err instanceof ApiAuthError) return unauthorized(err.message);
    return serverError(err);
  }
}
