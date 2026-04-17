import { del, get as blobGet, put } from "@vercel/blob";
import type {
  StorageGetResult,
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
  return (content as Uint8Array).byteLength;
}

async function streamToUint8Array(stream: ReadableStream): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.byteLength;
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
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

    // @vercel/blob's put wants Blob | Buffer | ReadableStream | File — wrap
    // plain Uint8Arrays via Buffer.from() (zero-copy in Node).
    const body =
      content instanceof Blob
        ? content
        : Buffer.isBuffer(content)
          ? content
          : Buffer.from(content);

    const blob = await put(key, body, {
      access: "private",
      contentType: mimeType,
      token: this.token,
      addRandomSuffix: false,
    });

    return {
      storageKey: blob.pathname,
      sizeBytes: byteLength(content),
    };
  }

  async delete(storageKey: string): Promise<void> {
    try {
      await del(storageKey, { token: this.token });
    } catch (err) {
      if (err instanceof Error && /not.*found|404/i.test(err.message)) return;
      throw err;
    }
  }

  async get(storageKey: string): Promise<StorageGetResult> {
    const result = await blobGet(storageKey, {
      access: "private",
      token: this.token,
    });
    if (!result || !result.stream) {
      throw new Error(`Blob not found: ${storageKey}`);
    }
    const content = await streamToUint8Array(result.stream);
    const mimeType =
      result.headers.get("content-type") ?? result.blob?.contentType ?? undefined;
    return { content, mimeType };
  }
}
