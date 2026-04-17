/**
 * Storage abstraction. MVP backs everything onto Vercel Blob; V2 may route
 * per-account (BYO-bucket). Providers identify themselves with a stable
 * `name` that matches the `storage_provider` column on `files`.
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
  /** Publicly reachable URL (Vercel Blob URLs are unguessable). */
  url: string;
  /** Exact byte count of the stored object. */
  sizeBytes: number;
}

export interface StorageProvider {
  readonly name: StorageProviderName;

  /** Upload bytes; returns the persisted storage key + URL + size. */
  put(input: StoragePutInput): Promise<StoragePutResult>;

  /** Delete by storage key. Idempotent (no error if missing). */
  delete(storageKey: string): Promise<void>;

  /** Fetch raw bytes. */
  get(storageKey: string): Promise<Uint8Array>;
}
