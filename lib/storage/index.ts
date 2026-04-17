import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { spaces, storageProviders } from "@/lib/db/schema";
import { decryptJson } from "./encryption";
import { GitHubProvider, type GitHubConfig } from "./github";
import { S3Provider, type S3Config } from "./s3";
import type { StorageProvider } from "./types";
import { VercelBlobProvider } from "./vercel-blob";

/**
 * Storage provider routing with the new per-account, named-providers model.
 *
 * Rules:
 *   - Internal Vercel Blob is implicit — no row in `storage_providers`, no
 *     id on the file, just the absence of one.
 *   - Users add 0..N named external providers (S3-compatible only for now).
 *   - Each Space can point at a provider; uploads into that space honour it.
 *   - Each File records the provider it was stored with (null = internal);
 *     reads/deletes must go to the original, otherwise old files vanish.
 *
 * API:
 *   - `getProviderForNewUpload(accountId, spaceId?)` — picks the right
 *     provider for a fresh file. Returns `{ provider, providerId }`.
 *   - `getProviderForFile(providerId)` — lookup by a stored file's FK.
 */

let cachedVercel: VercelBlobProvider | null = null;
function vercelBlob(): VercelBlobProvider {
  if (!cachedVercel) cachedVercel = new VercelBlobProvider();
  return cachedVercel;
}

export interface ResolvedProvider {
  provider: StorageProvider;
  /** Null means internal Vercel Blob; persist as such on the file row. */
  providerId: string | null;
}

/**
 * Pick the storage provider for a brand-new upload. Priority:
 *   1. Space-level override (`spaces.storage_provider_id`)
 *   2. Internal Vercel Blob (always-on)
 */
export async function getProviderForNewUpload(
  ownerAccountId: string,
  spaceId: string | null,
): Promise<ResolvedProvider> {
  if (spaceId) {
    const [space] = await db
      .select({ storageProviderId: spaces.storageProviderId })
      .from(spaces)
      .where(
        and(
          eq(spaces.id, spaceId),
          eq(spaces.ownerAccountId, ownerAccountId),
        ),
      )
      .limit(1);
    if (space?.storageProviderId) {
      const provider = await loadProvider(space.storageProviderId);
      return { provider, providerId: space.storageProviderId };
    }
  }
  return { provider: vercelBlob(), providerId: null };
}

/**
 * Pick the storage provider that handled an existing file. Called by read
 * + delete paths. `providerId` null ⇒ internal Vercel Blob.
 */
export async function getProviderForFile(
  providerId: string | null,
): Promise<StorageProvider> {
  if (!providerId) return vercelBlob();
  return loadProvider(providerId);
}

async function loadProvider(providerId: string): Promise<StorageProvider> {
  const [row] = await db
    .select({
      type: storageProviders.type,
      configEncrypted: storageProviders.configEncrypted,
    })
    .from(storageProviders)
    .where(eq(storageProviders.id, providerId))
    .limit(1);
  if (!row) {
    throw new Error(`Storage provider not found: ${providerId}`);
  }
  if (row.type === "s3") {
    const config = decryptJson<S3Config>(row.configEncrypted);
    return new S3Provider(config);
  }
  if (row.type === "github") {
    const config = decryptJson<GitHubConfig>(row.configEncrypted);
    return new GitHubProvider(config);
  }
  throw new Error(`Unsupported storage provider type: ${row.type}`);
}

/**
 * Minimal contract for providers that support browse + recursive listing.
 * Both S3 and GitHub implement it; the `/browse` and bulk-import routes
 * code against this interface so new read-only sources (Dropbox, GDrive,
 * WebDAV…) can plug in without touching those call sites.
 *
 * `isReadOnly` lets the UI hide upload/delete controls cleanly.
 */
export interface BrowsableProvider {
  readonly rootPrefix: string;
  readonly isReadOnly: boolean;
  listObjects(
    relativePrefix: string,
    continuationToken?: string,
  ): Promise<{
    directories: string[];
    objects: Array<{
      key: string;
      size: number;
      lastModified: string | null;
    }>;
    isTruncated: boolean;
    nextContinuationToken: string | null;
  }>;
  listRecursive(
    relativePrefix: string,
    limit?: number,
  ): Promise<{
    objects: Array<{
      key: string;
      size: number;
      lastModified: string | null;
    }>;
    truncatedAt: boolean;
  }>;
  getByRelativeKey(relativeKey: string): Promise<{
    content: Uint8Array;
    mimeType?: string;
  }>;
}

/**
 * Load a provider row + instantiate its browsable client in one step.
 * Returns the instance paired with the row's `type` + `name` for display.
 * Throws on unknown/unsupported provider types.
 */
export async function loadBrowsableProvider(
  ownerAccountId: string,
  providerId: string,
): Promise<{
  provider: BrowsableProvider;
  type: "s3" | "github";
  name: string;
}> {
  const [row] = await db
    .select({
      type: storageProviders.type,
      configEncrypted: storageProviders.configEncrypted,
      name: storageProviders.name,
    })
    .from(storageProviders)
    .where(
      and(
        eq(storageProviders.id, providerId),
        eq(storageProviders.ownerAccountId, ownerAccountId),
      ),
    )
    .limit(1);
  if (!row) {
    throw new Error(`Storage provider not found: ${providerId}`);
  }
  if (row.type === "s3") {
    const cfg = decryptJson<S3Config>(row.configEncrypted);
    const s3 = new S3Provider(cfg);
    // Object with `isReadOnly` surfaced at the call site — S3 is read/write.
    return {
      provider: Object.assign(s3, { isReadOnly: false }),
      type: "s3",
      name: row.name,
    };
  }
  if (row.type === "github") {
    const cfg = decryptJson<GitHubConfig>(row.configEncrypted);
    const gh = new GitHubProvider(cfg);
    return {
      provider: Object.assign(gh, { isReadOnly: true }),
      type: "github",
      name: row.name,
    };
  }
  throw new Error(`Unsupported storage provider type: ${row.type}`);
}

// ── Backwards-compat shims for call sites not yet migrated ──────────────────

/** @deprecated Use `getProviderForNewUpload` or `getProviderForFile`. */
export function getStorageProvider(): StorageProvider {
  return vercelBlob();
}

/** @deprecated — old single-provider API. Kept so old callers still build. */
export async function loadStorageContext(
  _ownerAccountId: string,
): Promise<never> {
  throw new Error(
    "loadStorageContext is deprecated — switch to getProviderForNewUpload / getProviderForFile.",
  );
}

/** @deprecated. */
export function getCurrentStorageProvider(): StorageProvider {
  return vercelBlob();
}

/** @deprecated. */
export function getStorageProviderForFile(): StorageProvider {
  return vercelBlob();
}

export type { StorageProvider, StoragePutInput, StoragePutResult } from "./types";
