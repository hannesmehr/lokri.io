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
 * List the external storage contents of a space at a sub-directory.
 *
 * Input: `?prefix=folder/sub/` (relative to the provider's root pathPrefix).
 * Output: `{ directories: [], objects: [] }` with relative keys.
 *
 * Only spaces bound to an external provider return content; internal-storage
 * spaces return 204 with an informational message — keeps the client branch
 * uniform.
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { ownerAccountId } = await requireSessionWithAccount();
    const { id } = await params;

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
    if (!space) return notFound();

    if (!space.storageProviderId) {
      return NextResponse.json({
        attached: false,
        directories: [],
        objects: [],
        prefix: "",
      });
    }

    const [providerRow] = await db
      .select({
        configEncrypted: storageProviders.configEncrypted,
        type: storageProviders.type,
        name: storageProviders.name,
      })
      .from(storageProviders)
      .where(
        and(
          eq(storageProviders.id, space.storageProviderId),
          eq(storageProviders.ownerAccountId, ownerAccountId),
        ),
      )
      .limit(1);
    if (!providerRow) return apiError("Provider not found", 404);
    if (providerRow.type !== "s3") {
      return apiError("Browsing is only supported for S3 providers", 400);
    }

    const prefixParam = req.nextUrl.searchParams.get("prefix") ?? "";
    const continuation = req.nextUrl.searchParams.get("cursor") ?? undefined;

    const config = decryptJson<S3Config>(providerRow.configEncrypted);
    const s3 = new S3Provider(config);
    const result = await s3.listObjects(prefixParam, continuation);

    return NextResponse.json({
      attached: true,
      providerName: providerRow.name,
      prefix: prefixParam,
      ...result,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return unauthorized(err.message);
    console.error("[spaces.browse]", err);
    return serverError(err);
  }
}
