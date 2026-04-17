import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  apiError,
  notFound,
  parseJsonBody,
  paymentRequired,
  serverError,
  unauthorized,
  zodError,
} from "@/lib/api/errors";
import { ApiAuthError, requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import {
  fileChunks,
  files,
  spaces,
  storageProviders,
} from "@/lib/db/schema";
import { chunkText, embedTexts } from "@/lib/embeddings";
import { isTextualMime, mimeTypeFromFilename } from "@/lib/mime";
import { applyQuotaDelta, checkQuota } from "@/lib/quota";
import { limit, rateLimitResponse } from "@/lib/rate-limit";
import { decryptJson } from "@/lib/storage/encryption";
import { S3Provider, type S3Config } from "@/lib/storage/s3";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  /** Key relative to the provider's path_prefix (same as browse UI). */
  key: z.string().min(1).max(1500),
});

type Params = { params: Promise<{ id: string }> };

/**
 * Materialize an external S3 object as a lokri `files` row — making it
 * part of the semantic index + MCP-discoverable. Idempotent: re-importing
 * returns the existing row.
 *
 * Textual content (text/* + application/json) is chunked + embedded.
 * Binary just gets a row (no embedding).
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { ownerAccountId } = await requireSessionWithAccount();
    const { id } = await params;

    const rl = await limit("fileUpload", `u:${ownerAccountId}`);
    if (!rl.ok) return rateLimitResponse(rl);

    const body = await parseJsonBody(req, 4 * 1024);
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

    const [providerRow] = await db
      .select({
        id: storageProviders.id,
        configEncrypted: storageProviders.configEncrypted,
        type: storageProviders.type,
      })
      .from(storageProviders)
      .where(
        and(
          eq(storageProviders.id, space.storageProviderId),
          eq(storageProviders.ownerAccountId, ownerAccountId),
        ),
      )
      .limit(1);
    if (!providerRow || providerRow.type !== "s3") {
      return apiError("Unsupported provider", 400);
    }

    const config = decryptJson<S3Config>(providerRow.configEncrypted);
    const s3 = new S3Provider(config);

    // Fetch the object — get bytes + mime type
    const { content, mimeType: detectedMime } =
      await s3.getByRelativeKey(parsed.data.key);
    const filename = parsed.data.key.split("/").pop() || parsed.data.key;
    const mime = detectedMime ?? mimeTypeFromFilename(filename);

    // Full storage_key consistent with how our upload path writes:
    const rootPrefix = (config.pathPrefix ?? "").replace(/^\/+|\/+$/g, "");
    const storageKey = rootPrefix
      ? `${rootPrefix}/${parsed.data.key}`
      : parsed.data.key;

    // Idempotency — look up (providerId, storageKey).
    const [existing] = await db
      .select({ id: files.id })
      .from(files)
      .where(
        and(
          eq(files.ownerAccountId, ownerAccountId),
          eq(files.storageProviderId, providerRow.id),
          eq(files.storageKey, storageKey),
        ),
      )
      .limit(1);
    if (existing) {
      return NextResponse.json({
        fileId: existing.id,
        alreadyImported: true,
      });
    }

    // Quota-Check auf Bytes + File-Count.
    const quota = await checkQuota(ownerAccountId, {
      bytes: content.byteLength,
      files: 1,
    });
    if (!quota.ok) return paymentRequired(quota.reason);

    const [row] = await db
      .insert(files)
      .values({
        ownerAccountId,
        spaceId: space.id,
        filename,
        mimeType: mime,
        sizeBytes: content.byteLength,
        storageProviderId: providerRow.id,
        storageKey,
      })
      .returning({ id: files.id });

    if (isTextualMime(mime)) {
      try {
        const text = Buffer.from(content).toString("utf-8");
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
      } catch (err) {
        // Non-fatal: file row is fine without chunks; admin can re-run.
        console.error(
          `[import-external] embedding failed for ${row.id}:`,
          err,
        );
      }
    }

    await applyQuotaDelta(ownerAccountId, {
      bytes: content.byteLength,
      files: 1,
    });

    return NextResponse.json({ fileId: row.id, alreadyImported: false });
  } catch (err) {
    if (err instanceof ApiAuthError) return unauthorized(err.message);
    console.error("[external.import]", err);
    return serverError(err);
  }
}
