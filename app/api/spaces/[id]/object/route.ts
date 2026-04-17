import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { apiError, notFound, serverError, unauthorized } from "@/lib/api/errors";
import { ApiAuthError, requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { spaces } from "@/lib/db/schema";
import { loadBrowsableProvider } from "@/lib/storage";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * Stream an object from a space's external storage. The `key` query param is
 * RELATIVE to the provider's `pathPrefix` — callers can never break out into
 * a different part of the bucket / repo.
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

    const { provider } = await loadBrowsableProvider(
      ownerAccountId,
      space.storageProviderId,
    );
    const { content, mimeType } = await provider.getByRelativeKey(key);

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
