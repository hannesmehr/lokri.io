/**
 * Storage abstraction. Backends:
 *   - "vercel_blob" — always-on internal storage, env-configured
 *   - "s3" — N named per-account providers (table `storage_providers`)
 *
 * Blobs are private: the storage key is an opaque pathname or S3 key, never
 * a publicly-reachable URL. Downloads go through the Next.js server so
 * ownership can be re-checked on each request.
 */

export type StorageProviderName = "vercel_blob" | "s3" | "github";

export interface StoragePutInput {
  /** Owner account the file belongs to — used as a key prefix. */
  ownerAccountId: string;
  /** User-visible filename. Stored as-is; slugified for the storage key. */
  filename: string;
  /** File bytes. Kept in-memory — MVP caps single uploads at ~10 MB. */
  content: Uint8Array | Buffer | Blob;
  /** MIME type, e.g. "image/png". */
  mimeType: string;
  /**
   * Browse-oriented destination prefix (e.g. `"docs/2024/"`). When set,
   * the S3 provider stores the object at `{rootPrefix}/{targetPrefix}/
   * {slugifiedFilename}` — file lands where the user is looking, keeps
   * its original name (no UUID prefix). Used by drag-&-drop in the
   * space browser. Ignored by Vercel Blob (no browsable hierarchy).
   *
   * Omit for the "library" layout used by the Files page, where the
   * provider picks a collision-free UUID-based key.
   */
  targetPrefix?: string;
}

export interface StoragePutResult {
  /** Opaque, provider-specific key. Persist this in `files.storage_key`. */
  storageKey: string;
  /** Exact byte count of the stored object. */
  sizeBytes: number;
}

export interface StorageGetResult {
  content: Uint8Array;
  mimeType?: string;
}

export interface StorageProvider {
  readonly name: StorageProviderName;

  /** Upload bytes; returns the persisted storage key + size. */
  put(input: StoragePutInput): Promise<StoragePutResult>;

  /** Delete by storage key. Idempotent (no error if missing). */
  delete(storageKey: string): Promise<void>;

  /** Fetch raw bytes + content-type. Used by the download proxy. */
  get(storageKey: string): Promise<StorageGetResult>;
}
