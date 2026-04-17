import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type {
  StorageGetResult,
  StorageProvider,
  StoragePutInput,
  StoragePutResult,
} from "./types";

/**
 * S3-compatible storage. Works against AWS S3, Cloudflare R2, Backblaze B2,
 * Wasabi, MinIO, or any other service that speaks the S3 API. The endpoint
 * URL discriminates — AWS gets `undefined` so the SDK picks the regional
 * host; R2 / B2 / custom get an explicit URL.
 */

export interface S3Config {
  /** e.g. "https://<accountid>.r2.cloudflarestorage.com" — omit for AWS. */
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Optional path prefix inside the bucket, e.g. `"lokri/"`. */
  pathPrefix?: string;
  /**
   * Defaults to `true` for non-AWS endpoints (R2 needs path-style; AWS
   * supports both). Surfaces as `forcePathStyle` on the SDK client.
   */
  forcePathStyle?: boolean;
}

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

async function streamToUint8Array(
  stream: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  // Prefer Web ReadableStream where available (AWS SDK v3 uses it in Node)
  if ("getReader" in stream) {
    const reader = (stream as ReadableStream<Uint8Array>).getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.byteLength;
      }
    }
  } else {
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
      total += chunk.byteLength;
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

export class S3Provider implements StorageProvider {
  readonly name = "s3" as const;

  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly prefix: string;

  constructor(private readonly config: S3Config) {
    this.bucket = config.bucket;
    this.prefix = (config.pathPrefix ?? "").replace(/^\/+|\/+$/g, "");
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle:
        config.forcePathStyle ?? Boolean(config.endpoint),
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  private key(sub: string): string {
    return this.prefix ? `${this.prefix}/${sub}` : sub;
  }

  async put(input: StoragePutInput): Promise<StoragePutResult> {
    const { ownerAccountId, filename, content, mimeType } = input;
    const safe = slugifyFilename(filename) || "file";
    const key = this.key(
      `${ownerAccountId}/${crypto.randomUUID()}-${safe}`,
    );

    const body =
      content instanceof Blob
        ? Buffer.from(await content.arrayBuffer())
        : Buffer.isBuffer(content)
          ? content
          : Buffer.from(content);

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: mimeType,
      }),
    );

    return {
      storageKey: key,
      sizeBytes: byteLength(content),
    };
  }

  async delete(storageKey: string): Promise<void> {
    // S3 DeleteObject is idempotent — deleting a missing key returns 204.
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
      }),
    );
  }

  async get(storageKey: string): Promise<StorageGetResult> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }),
    );
    if (!res.Body) {
      throw new Error(`S3 object has no body: ${storageKey}`);
    }
    // SDK returns `Body` as ReadableStream (Node) or web Blob/Uint8Array in
    // other runtimes. Normalise via transformToByteArray if available.
    let content: Uint8Array;
    if ("transformToByteArray" in res.Body) {
      content = await (
        res.Body as unknown as { transformToByteArray(): Promise<Uint8Array> }
      ).transformToByteArray();
    } else {
      content = await streamToUint8Array(
        res.Body as unknown as AsyncIterable<Uint8Array>,
      );
    }
    return { content, mimeType: res.ContentType };
  }

  /**
   * Lightweight connectivity check — used by the UI "Test connection"
   * button before persisting the config. Throws a descriptive error on
   * failure (401, bucket missing, wrong region, CORS, etc.).
   */
  async testConnection(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }
}
