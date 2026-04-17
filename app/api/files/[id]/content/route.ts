import { NextResponse, type NextRequest } from "next/server";
import { notFound, serverError, unauthorized } from "@/lib/api/errors";
import { findOwnedFile } from "@/lib/api/ownership";
import { ApiAuthError, requireSessionWithAccount } from "@/lib/api/session";
import { getProviderForFile } from "@/lib/storage";

type Params = { params: Promise<{ id: string }> };

/**
 * Stream the raw file content for the authenticated owner. This is the ONLY
 * way clients get file bytes — Vercel Blob is configured private so the
 * underlying storage URL is never exposed.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { ownerAccountId } = await requireSessionWithAccount();
    const { id } = await params;
    const file = await findOwnedFile(ownerAccountId, id);
    if (!file) return notFound();

    const provider = await getProviderForFile(file.storageProviderId);
    const { content, mimeType } = await provider.get(file.storageKey);

    const headers = new Headers({
      "content-type": mimeType ?? file.mimeType,
      "content-length": String(content.byteLength),
      "content-disposition": `inline; filename="${encodeURIComponent(file.filename)}"`,
      // Private blob: no intermediate caches.
      "cache-control": "private, no-store",
    });

    // NextResponse accepts BodyInit. Cast via `BodyInit` because Uint8Array's
    // generic ArrayBufferLike confuses TS's BlobPart inference across libs.
    return new NextResponse(content as unknown as BodyInit, {
      status: 200,
      headers,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return unauthorized(err.message);
    return serverError(err);
  }
}
