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
import { spaces, storageProviders } from "@/lib/db/schema";
import { decryptJson } from "@/lib/storage/encryption";
import { S3Provider, type S3Config } from "@/lib/storage/s3";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * Stream an object from a space's external storage. The `key` query param is
 * RELATIVE to the provider's `pathPrefix` — callers can never break out into
 * a different part of the bucket.
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { ownerAccountId } = await requireSessionWithAccount();
    const { id } = await params;
    const key = req.nextUrl.searchParams.get("key");
    if (!key) return apiError("Missing `key` parameter", 400);

    const [space] = await db
      .select({
        id: spaces.id,
        storageProviderId: spaces.storageProviderId,
      })
      .from(spaces)
      .where(
        and(eq(spaces.id, id), eq(spaces.ownerAccountId, ownerAccountId)),
      )
      .limit(1);
    if (!space || !space.storageProviderId) return notFound();

    const [providerRow] = await db
      .select({
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
    const { content, mimeType } = await s3.getByRelativeKey(key);

    // Derive a reasonable filename for the Content-Disposition header.
    const filename = key.split("/").pop() || "file";

    const headers = new Headers({
      "content-type": mimeType ?? "application/octet-stream",
      "content-length": String(content.byteLength),
      "content-disposition": `inline; filename="${encodeURIComponent(filename)}"`,
      "cache-control": "private, no-store",
    });
    return new NextResponse(content as unknown as BodyInit, {
      status: 200,
      headers,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return unauthorized(err.message);
    console.error("[spaces.object]", err);
    return serverError(err);
  }
}
