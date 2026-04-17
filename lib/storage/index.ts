import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { ownerAccounts } from "@/lib/db/schema";
import { decryptJson } from "./encryption";
import { S3Provider, type S3Config } from "./s3";
import type { StorageProvider, StorageProviderName } from "./types";
import { VercelBlobProvider } from "./vercel-blob";

/**
 * Per-account storage routing.
 *
 * Two lookup modes:
 *  - `getCurrentStorageProvider(account)` — used on WRITE paths (uploads).
 *    Returns the provider the account is currently configured to write to.
 *  - `getStorageProviderForName(name, account)` — used on READ/DELETE paths
 *    keyed by `files.storage_provider`. An old file might be on Vercel Blob
 *    even though the account has since switched to S3 — we honor that.
 *
 * S3 configs are decrypted lazily per call. With realistic traffic a small
 * in-memory LRU would help; for now every op pays a scrypt+decrypt tax.
 * Cache invalidation gets tricky (updates must evict), so we skip until
 * it matters.
 */

let cachedVercel: VercelBlobProvider | null = null;
function vercelBlob(): VercelBlobProvider {
  if (!cachedVercel) cachedVercel = new VercelBlobProvider();
  return cachedVercel;
}

export interface StorageAccountContext {
  id: string;
  storageProvider: StorageProviderName;
  storageConfigEncrypted: string | null;
}

/**
 * Load the account's storage context from the DB. Small enough to inline
 * everywhere instead of making callers pass it explicitly.
 */
export async function loadStorageContext(
  ownerAccountId: string,
): Promise<StorageAccountContext> {
  const [row] = await db
    .select({
      id: ownerAccounts.id,
      storageProvider: ownerAccounts.storageProvider,
      storageConfigEncrypted: ownerAccounts.storageConfigEncrypted,
    })
    .from(ownerAccounts)
    .where(eq(ownerAccounts.id, ownerAccountId))
    .limit(1);
  if (!row) {
    throw new Error(`Owner account not found: ${ownerAccountId}`);
  }
  return {
    id: row.id,
    storageProvider: row.storageProvider as StorageProviderName,
    storageConfigEncrypted: row.storageConfigEncrypted,
  };
}

/**
 * Build the provider the account is configured for _right now_. Use this on
 * the upload path.
 */
export function getCurrentStorageProvider(
  ctx: StorageAccountContext,
): StorageProvider {
  if (ctx.storageProvider === "s3") return buildS3(ctx);
  return vercelBlob();
}

/**
 * Build the provider that was used when a specific file was uploaded. Use
 * this on read/delete paths. Only S3 needs the account context; Vercel Blob
 * is env-keyed.
 */
export function getStorageProviderForFile(
  fileProviderName: StorageProviderName,
  ctx: StorageAccountContext,
): StorageProvider {
  if (fileProviderName === "s3") return buildS3(ctx);
  return vercelBlob();
}

function buildS3(ctx: StorageAccountContext): S3Provider {
  if (!ctx.storageConfigEncrypted) {
    throw new Error(
      `Account ${ctx.id} is configured for S3 but has no storage_config.`,
    );
  }
  const config = decryptJson<S3Config>(ctx.storageConfigEncrypted);
  return new S3Provider(config);
}

/**
 * Backwards-compatible shim. Old call sites that don't have the account
 * context yet still work against Vercel Blob. New code paths should prefer
 * `getCurrentStorageProvider` / `getStorageProviderForFile`.
 */
export function getStorageProvider(): StorageProvider {
  return vercelBlob();
}

export type { StorageProvider, StoragePutInput, StoragePutResult } from "./types";
