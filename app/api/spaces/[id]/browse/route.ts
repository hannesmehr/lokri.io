import { and, desc, eq, inArray, isNull } from "drizzle-orm";
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

type ObjectEntry = {
  kind: "internal" | "external";
  /** Relative path — for external = relative to provider root; for internal = filename. */
  key: string;
  /** files.id when this has a materialised row; null for non-imported external objects. */
  fileId: string | null;
  size: number;
  lastModified: string | null;
  mimeType: string | null;
  imported: boolean;
  hidden: boolean;
};

type DirEntry = { key: string; hidden: boolean };

function isKeyHidden(key: string, hiddenList: string[]): boolean {
  for (const h of hiddenList) {
    if (h.endsWith("/")) {
      if (key.startsWith(h)) return true;
    } else if (h === key) return true;
  }
  return false;
}

/**
 * Unified directory browser for a space.
 *
 * If the space is attached to an external S3 provider, lists bucket contents
 * (with `imported`/`hidden` enrichment). Otherwise lists internal Vercel-Blob
 * files belonging to this space. Both modes share the same response shape so
 * the UI component can render either transparently.
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
      .where(and(eq(spaces.id, id), eq(spaces.ownerAccountId, ownerAccountId)))
      .limit(1);
    if (!space) return notFound();

    const hiddenList = space.hiddenExternalKeys ?? [];

    // ── Internal path (no external provider) ───────────────────────────
    if (!space.storageProviderId) {
      const rows = await db
        .select({
          id: files.id,
          filename: files.filename,
          mimeType: files.mimeType,
          sizeBytes: files.sizeBytes,
          mcpHidden: files.mcpHidden,
          createdAt: files.createdAt,
        })
        .from(files)
        .where(
          and(
            eq(files.ownerAccountId, ownerAccountId),
            eq(files.spaceId, id),
            isNull(files.storageProviderId),
          ),
        )
        .orderBy(desc(files.createdAt))
        .limit(1000);

      const objects: ObjectEntry[] = rows.map((r) => ({
        kind: "internal",
        key: r.filename,
        fileId: r.id,
        size: r.sizeBytes,
        lastModified: r.createdAt.toISOString(),
        mimeType: r.mimeType,
        imported: true,
        hidden: r.mcpHidden,
      }));

      return NextResponse.json({
        source: "internal",
        providerName: "lokri-managed",
        prefix: "",
        directories: [] as DirEntry[],
        objects,
        isTruncated: false,
        nextContinuationToken: null,
      });
    }

    // ── External path (S3) ─────────────────────────────────────────────
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

    // Enrich objects with imported/hidden flags.
    const relativeKeys = result.objects.map((o) => o.key);
    const fullPrefix = (config.pathPrefix ?? "").replace(/^\/+|\/+$/g, "");
    const fullKeys = relativeKeys.map((k) =>
      fullPrefix ? `${fullPrefix}/${k}` : k,
    );

    const fileRowByKey = new Map<string, string>();
    if (fullKeys.length > 0) {
      const rows = await db
        .select({ id: files.id, storageKey: files.storageKey })
        .from(files)
        .where(
          and(
            eq(files.ownerAccountId, ownerAccountId),
            eq(files.storageProviderId, space.storageProviderId),
            inArray(files.storageKey, fullKeys),
          ),
        );
      for (const r of rows) fileRowByKey.set(r.storageKey, r.id);
    }

    const objects: ObjectEntry[] = result.objects.map((o, i) => ({
      kind: "external",
      key: o.key,
      fileId: fileRowByKey.get(fullKeys[i]) ?? null,
      size: o.size,
      lastModified: o.lastModified,
      mimeType: null,
      imported: fileRowByKey.has(fullKeys[i]),
      hidden: isKeyHidden(o.key, hiddenList),
    }));

    const directories: DirEntry[] = result.directories.map((d) => ({
      key: d,
      hidden: isKeyHidden(d, hiddenList),
    }));

    return NextResponse.json({
      source: "external",
      providerName: providerRow.name,
      prefix: prefixParam,
      directories,
      objects,
      isTruncated: result.isTruncated,
      nextContinuationToken: result.nextContinuationToken,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return unauthorized(err.message);
    console.error("[spaces.browse]", err);
    return serverError(err);
  }
}
