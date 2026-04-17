import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

const TOKEN_PREFIX = "lk_";
/** Random bytes encoded as base64url. 24 bytes → 32 chars. */
const TOKEN_RANDOM_BYTES = 24;
/** Number of characters we expose in the DB/UI for visual identification. */
const DISPLAY_PREFIX_LENGTH = 10; // e.g. "lk_abc1..." (prefix + 7 random chars)
const BCRYPT_ROUNDS = 12;

export interface GeneratedToken {
  /** Full plaintext — shown to the user exactly once. */
  plaintext: string;
  /** Public prefix safe to persist and display ("lk_abcdefg"). */
  prefix: string;
  /** bcrypt hash of the plaintext. Persist in `api_tokens.token_hash`. */
  hash: string;
}

/**
 * Mint a new API token. The plaintext is returned to the caller once; only
 * the bcrypt hash + the public prefix are ever stored.
 */
export async function generateApiToken(): Promise<GeneratedToken> {
  const random = randomBytes(TOKEN_RANDOM_BYTES).toString("base64url");
  const plaintext = `${TOKEN_PREFIX}${random}`;
  const prefix = plaintext.slice(0, DISPLAY_PREFIX_LENGTH);
  const hash = await bcrypt.hash(plaintext, BCRYPT_ROUNDS);
  return { plaintext, prefix, hash };
}

/**
 * Verify a user-supplied token against a stored bcrypt hash. Used by the MCP
 * auth middleware (Schritt 9).
 */
export async function verifyApiToken(
  plaintext: string,
  hash: string,
): Promise<boolean> {
  if (!plaintext.startsWith(TOKEN_PREFIX)) return false;
  return bcrypt.compare(plaintext, hash);
}

/** For UI display — deterministic prefix for an existing plaintext. */
export function tokenPrefix(plaintext: string): string {
  return plaintext.slice(0, DISPLAY_PREFIX_LENGTH);
}

export const TOKEN_FORMAT = {
  prefix: TOKEN_PREFIX,
  displayPrefixLength: DISPLAY_PREFIX_LENGTH,
} as const;
