import { del, head, put } from "@vercel/blob";
import type {
  StorageProvider,
  StoragePutInput,
  StoragePutResult,
} from "./types";

/**
 * Slugify a filename for inclusion in a storage key. Keeps the extension,
 * collapses everything else to [a-z0-9._-].
 */
function slugifyFilename(filename: string): string {
  return filename
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function byteLength(content: Uint8Array | Buffer | Blob): number {
  if (content instanceof Blob) return content.size;
  // Buffer is a Uint8Array subclass in Node.
  return (content as Uint8Array).byteLength;
}

export class VercelBlobProvider implements StorageProvider {
  readonly name = "vercel_blob" as const;

  private readonly token: string;

  constructor(token: string = process.env.BLOB_READ_WRITE_TOKEN ?? "") {
    if (!token) {
      throw new Error(
        "BLOB_READ_WRITE_TOKEN is not set (required for VercelBlobProvider)",
      );
    }
    this.token = token;
  }

  async put(input: StoragePutInput): Promise<StoragePutResult> {
    const { ownerAccountId, filename, content, mimeType } = input;
    const safe = slugifyFilename(filename) || "file";
    const key = `${ownerAccountId}/${crypto.randomUUID()}-${safe}`;

    // Vercel Blob's put() wants Blob | Buffer | ReadableStream | File — not a
    // plain Uint8Array. Wrap it in Buffer.from() (zero-copy in Node).
    const body =
      content instanceof Blob
        ? content
        : Buffer.isBuffer(content)
          ? content
          : Buffer.from(content);

    const blob = await put(key, body, {
      access: "public",
      contentType: mimeType,
      token: this.token,
      addRandomSuffix: false,
    });

    return {
      storageKey: blob.url,
      url: blob.url,
      sizeBytes: byteLength(content),
    };
  }

  async delete(storageKey: string): Promise<void> {
    try {
      await del(storageKey, { token: this.token });
    } catch (err) {
      // Delete should be idempotent; swallow 404s.
      if (err instanceof Error && /not.*found|404/i.test(err.message)) return;
      throw err;
    }
  }

  async get(storageKey: string): Promise<Uint8Array> {
    // `head` validates the blob exists (and yields its URL if we ever stop
    // storing the URL as the key). For now key === url, so we just fetch.
    const { url } = await head(storageKey, { token: this.token });
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Vercel Blob fetch failed: ${res.status} ${res.statusText}`);
    }
    return new Uint8Array(await res.arrayBuffer());
  }
}
