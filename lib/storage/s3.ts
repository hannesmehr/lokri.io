import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
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

  /** The configured path-prefix, safe for external callers. */
  get rootPrefix(): string {
    return this.prefix;
  }

  /**
   * Directory-style listing at `prefix`. `prefix` is relative to
   * `rootPrefix` — the UI works in a user-relative namespace so it can
   * never escape the configured path scope.
   *
   * Returns common-prefixes (sub-"directories") + object keys at this
   * level. Paginated via `continuationToken`.
   */
  async listObjects(
    relativePrefix: string,
    continuationToken?: string,
  ): Promise<{
    /** Sub-directories at this level (e.g. `"photos/"`). Relative to the
     *  requested `relativePrefix`. */
    directories: string[];
    /** Objects at this level (flat — not recursing into subdirs). */
    objects: Array<{
      key: string; // relative to rootPrefix — what callers pass to downloads
      size: number;
      lastModified: string | null;
    }>;
    isTruncated: boolean;
    nextContinuationToken: string | null;
  }> {
    // Normalise: drop leading slashes + ensure trailing "/" if non-empty
    const cleanRel = relativePrefix.replace(/^\/+/, "");
    const normalized = cleanRel && !cleanRel.endsWith("/") ? `${cleanRel}/` : cleanRel;
    const fullPrefix = this.prefix
      ? `${this.prefix}/${normalized}`
      : normalized;

    const res = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: fullPrefix,
        Delimiter: "/",
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      }),
    );

    const stripRoot = (k: string) => {
      if (!this.prefix) return k;
      const p = `${this.prefix}/`;
      return k.startsWith(p) ? k.slice(p.length) : k;
    };

    const directories = (res.CommonPrefixes ?? [])
      .map((c) => (c.Prefix ? stripRoot(c.Prefix) : null))
      .filter((p): p is string => !!p);

    const objects = (res.Contents ?? [])
      // S3 echoes the prefix itself as an object sometimes; skip zero-byte "dir markers"
      .filter((o) => o.Key && o.Key !== fullPrefix)
      .map((o) => ({
        key: stripRoot(o.Key!),
        size: Number(o.Size ?? 0),
        lastModified: o.LastModified
          ? o.LastModified.toISOString()
          : null,
      }));

    return {
      directories,
      objects,
      isTruncated: Boolean(res.IsTruncated),
      nextContinuationToken: res.NextContinuationToken ?? null,
    };
  }

  /**
   * Recursive (flat) listing of all objects under a relative prefix —
   * crosses directory boundaries. Capped at `limit` to bound duration;
   * returns whatever was collected + a flag if more exist.
   */
  async listRecursive(
    relativePrefix: string,
    limit = 500,
  ): Promise<{
    objects: Array<{
      key: string;
      size: number;
      lastModified: string | null;
    }>;
    truncatedAt: boolean;
  }> {
    const cleanRel = relativePrefix.replace(/^\/+/, "");
    const normalized =
      cleanRel && !cleanRel.endsWith("/") ? `${cleanRel}/` : cleanRel;
    const fullPrefix = this.prefix
      ? `${this.prefix}/${normalized}`
      : normalized;

    const stripRoot = (k: string) => {
      if (!this.prefix) return k;
      const p = `${this.prefix}/`;
      return k.startsWith(p) ? k.slice(p.length) : k;
    };

    const collected: Array<{
      key: string;
      size: number;
      lastModified: string | null;
    }> = [];
    let continuationToken: string | undefined;

    for (;;) {
      const res = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: fullPrefix,
          ContinuationToken: continuationToken,
          MaxKeys: Math.min(1000, limit - collected.length),
        }),
      );
      for (const o of res.Contents ?? []) {
        if (!o.Key || o.Key === fullPrefix) continue;
        collected.push({
          key: stripRoot(o.Key),
          size: Number(o.Size ?? 0),
          lastModified: o.LastModified ? o.LastModified.toISOString() : null,
        });
        if (collected.length >= limit) {
          return { objects: collected, truncatedAt: true };
        }
      }
      if (!res.IsTruncated) break;
      continuationToken = res.NextContinuationToken;
    }
    return { objects: collected, truncatedAt: false };
  }

  /**
   * Fetch an object by key relative to `rootPrefix`. Throws if the caller's
   * `relativeKey` tries to escape the root (defence against path-prefix
   * bypass).
   */
  async getByRelativeKey(relativeKey: string): Promise<{
    content: Uint8Array;
    mimeType?: string;
  }> {
    if (relativeKey.includes("..")) {
      throw new Error("Relative keys may not contain '..'.");
    }
    const cleanRel = relativeKey.replace(/^\/+/, "");
    const fullKey = this.prefix ? `${this.prefix}/${cleanRel}` : cleanRel;
    return this.get(fullKey);
  }
}
