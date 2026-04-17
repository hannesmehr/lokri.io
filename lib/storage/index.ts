import type { StorageProvider } from "./types";
import { VercelBlobProvider } from "./vercel-blob";

/**
 * Per-account storage provider factory.
 *
 * MVP: everyone is on Vercel Blob. The `ownerAccount` arg is reserved so
 * future BYO-bucket routing (V2) can land without touching call sites.
 *
 * A single provider instance is cached because the Vercel Blob client is
 * stateless and token-validation in the constructor is cheap.
 */

// Lazy singleton — constructed on first use so routes that never touch
// storage don't fail startup when BLOB_READ_WRITE_TOKEN is unset.
let cached: StorageProvider | null = null;

type OwnerAccountLike = { id: string; type: "personal" | "team" };

export function getStorageProvider(
  _ownerAccount?: OwnerAccountLike,
): StorageProvider {
  if (!cached) {
    cached = new VercelBlobProvider();
  }
  return cached;
}

export type { StorageProvider, StoragePutInput, StoragePutResult } from "./types";
