import { and, eq, inArray } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import {
  apiError,
  notFound,
  serverError,
  unauthorized,
} from "@/lib/api/errors";
import { ApiAuthError, requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { files, spaces, storageProviders } from "@/lib/db/schema";
import { decryptJson } from "@/lib/storage/encryption";
import { S3Provider, type S3Config } from "@/lib/storage/s3";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * Directory-style listing of the space's external bucket + enrichment.
 *
 * Each object carries:
 *   - `imported`: a `files` row already references this key in lokri
 *   - `hidden`:   user flagged this key via the space's hidden list
 *
 * The UI uses these to gate the 3-dot actions + dim hidden rows.
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { ownerAccountId } = await requireSessionWithAccount();
    const { id } = await params;

    const [space] = await db
      .select({
        id: spaces.id,
        storageProviderId: spaces.storageProviderId,
        hiddenExternalKeys: spaces.hiddenExternalKeys,
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

    // Enrich: which relative keys already have a `files` row?
    const hiddenSet = new Set(space.hiddenExternalKeys);
    const relativeKeys = result.objects.map((o) => o.key);
    const fullPrefix = (config.pathPrefix ?? "").replace(/^\/+|\/+$/g, "");
    const fullKeys = relativeKeys.map((k) =>
      fullPrefix ? `${fullPrefix}/${k}` : k,
    );

    let importedFullKeys = new Set<string>();
    if (fullKeys.length > 0) {
      const rows = await db
        .select({ storageKey: files.storageKey })
        .from(files)
        .where(
          and(
            eq(files.ownerAccountId, ownerAccountId),
            eq(files.storageProviderId, space.storageProviderId),
            inArray(files.storageKey, fullKeys),
          ),
        );
      importedFullKeys = new Set(rows.map((r) => r.storageKey));
    }

    const enriched = result.objects.map((o, i) => ({
      ...o,
      imported: importedFullKeys.has(fullKeys[i]),
      hidden: hiddenSet.has(o.key),
    }));

    return NextResponse.json({
      attached: true,
      providerName: providerRow.name,
      prefix: prefixParam,
      directories: result.directories,
      objects: enriched,
      isTruncated: result.isTruncated,
      nextContinuationToken: result.nextContinuationToken,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return unauthorized(err.message);
    console.error("[spaces.browse]", err);
    return serverError(err);
  }
}
