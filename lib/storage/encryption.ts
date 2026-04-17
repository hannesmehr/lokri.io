import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

/**
 * AES-256-GCM for per-account storage credentials (S3 access/secret keys).
 *
 * Format of the ciphertext blob:
 *   v1:<base64(salt ‖ iv ‖ authTag ‖ ciphertext)>
 *
 * The `v1:` prefix lets us rotate the scheme later without ambiguous blobs.
 * The key is derived via scrypt from an env secret — we prefer
 * `STORAGE_CONFIG_KEY` if set, otherwise fall back to `BETTER_AUTH_SECRET`
 * (guaranteed to exist since auth.ts enforces it).
 */

const VERSION = "v1";
const KEY_LEN = 32; // AES-256
const IV_LEN = 12; // GCM nonce
const SALT_LEN = 16;
const TAG_LEN = 16;

function getMasterSecret(): string {
  const secret =
    process.env.STORAGE_CONFIG_KEY ?? process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "STORAGE_CONFIG_KEY (or BETTER_AUTH_SECRET as fallback) is required to encrypt storage configs.",
    );
  }
  return secret;
}

function deriveKey(salt: Buffer): Buffer {
  return scryptSync(getMasterSecret(), salt, KEY_LEN, {
    N: 16384,
    r: 8,
    p: 1,
  });
}

export function encryptJson(plaintext: unknown): string {
  const json = Buffer.from(JSON.stringify(plaintext), "utf-8");
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const key = deriveKey(salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(json), cipher.final()]);
  const tag = cipher.getAuthTag();
  const blob = Buffer.concat([salt, iv, tag, ciphertext]);
  return `${VERSION}:${blob.toString("base64")}`;
}

export function decryptJson<T = unknown>(encrypted: string): T {
  const [version, rest] = encrypted.split(":", 2);
  if (version !== VERSION || !rest) {
    throw new Error(`Unsupported storage-config version: ${version}`);
  }
  const blob = Buffer.from(rest, "base64");
  const salt = blob.subarray(0, SALT_LEN);
  const iv = blob.subarray(SALT_LEN, SALT_LEN + IV_LEN);
  const tag = blob.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + TAG_LEN);
  const ciphertext = blob.subarray(SALT_LEN + IV_LEN + TAG_LEN);
  const key = deriveKey(salt);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plain.toString("utf-8")) as T;
}
