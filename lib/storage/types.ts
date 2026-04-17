/**
 * Storage abstraction. MVP backs everything onto Vercel Blob (access: private);
 * V2 may route per-account (BYO-bucket). Providers identify themselves with a
 * stable `name` matching the `storage_provider` column on `files`.
 *
 * Blobs are private: the storage key is an opaque pathname, not a URL.
 * Downloads go through the Next.js server so ownership can be re-checked.
 */

export type StorageProviderName = "vercel_blob";

export interface StoragePutInput {
  /** Owner account the file belongs to — used as a key prefix. */
  ownerAccountId: string;
  /** User-visible filename. Stored as-is; slugified for the storage key. */
  filename: string;
  /** File bytes. Kept in-memory — MVP caps single uploads at ~10 MB. */
  content: Uint8Array | Buffer | Blob;
  /** MIME type, e.g. "image/png". */
  mimeType: string;
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
