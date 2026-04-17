import { embed, embedMany } from "ai";
import {
  DEFAULT_GATEWAY_MODEL,
  EMBEDDING_DIMENSIONS,
  getEmbeddingContext,
} from "@/lib/embedding-keys";

/**
 * `openai/text-embedding-3-small` is the Gateway-routed fallback — when
 * no per-account BYOK row exists, we use it (requires `AI_GATEWAY_API_KEY`).
 * Emits 1536-dim vectors matching `vector(1536)` on `file_chunks` / `notes`.
 *
 * With a BYOK row, `getEmbeddingContext(ownerAccountId)` returns an
 * `@ai-sdk/openai` provider instance so the request bypasses the Gateway
 * entirely and goes straight to api.openai.com.
 */
export const DEFAULT_EMBEDDING_MODEL = DEFAULT_GATEWAY_MODEL;
export { EMBEDDING_DIMENSIONS };

export interface EmbedResult {
  embedding: number[];
  /** Model id as persisted on the row (e.g. `"openai/text-embedding-3-small"`). */
  model: string;
}

export interface EmbedManyResult {
  embeddings: number[][];
  model: string;
}

/**
 * Embed a single string. Pass `ownerAccountId` to honour the account's
 * BYOK row; omit it from background scripts / seed code where no account
 * context exists (falls back to the Gateway-routed default).
 */
export async function embedText(
  text: string,
  ownerAccountId?: string,
): Promise<EmbedResult> {
  const ctx = await getEmbeddingContext(ownerAccountId);
  const { embedding } = await embed({ model: ctx.model, value: text });
  return { embedding, model: ctx.modelId };
}

/** Batch-embed. Most providers cap at ~100/call — caller must chunk. */
export async function embedTexts(
  texts: string[],
  ownerAccountId?: string,
): Promise<EmbedManyResult> {
  if (texts.length === 0) {
    const ctx = await getEmbeddingContext(ownerAccountId);
    return { embeddings: [], model: ctx.modelId };
  }
  const ctx = await getEmbeddingContext(ownerAccountId);
  const { embeddings } = await embedMany({ model: ctx.model, values: texts });
  return { embeddings, model: ctx.modelId };
}

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

export interface ChunkOptions {
  /**
   * Soft upper bound per chunk (characters, not tokens). Default 3000 ≈ 750
   * tokens for typical English/German prose. Safely under the
   * `text-embedding-3-small` input cap of 8191 tokens.
   */
  maxChars?: number;
  /** Overlap between consecutive chunks, in characters. Default 200 ≈ 50 tokens. */
  overlapChars?: number;
  /**
   * If `true`, prefer paragraph/sentence boundaries when splitting so chunks
   * don't end mid-word. Default `true`.
   */
  respectBoundaries?: boolean;
}

const DEFAULT_MAX_CHARS = 3000;
const DEFAULT_OVERLAP_CHARS = 200;

/**
 * Split `text` into overlapping chunks suitable for embedding. Prefers
 * paragraph boundaries (`\n\n`), then sentence endings (`. ! ?`), then a hard
 * cut at `maxChars`.
 *
 * Empty / whitespace-only input returns `[]`. Input shorter than `maxChars`
 * returns a single-element array.
 */
export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const overlapChars = options.overlapChars ?? DEFAULT_OVERLAP_CHARS;
  const respectBoundaries = options.respectBoundaries ?? true;

  if (maxChars <= 0) throw new Error("maxChars must be > 0");
  if (overlapChars < 0) throw new Error("overlapChars must be >= 0");
  if (overlapChars >= maxChars) {
    throw new Error("overlapChars must be < maxChars");
  }

  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized.length === 0) return [];
  if (normalized.length <= maxChars) return [normalized];

  const chunks: string[] = [];
  let start = 0;
  const minBoundaryPos = Math.floor(maxChars * 0.5);

  while (start < normalized.length) {
    const hardEnd = Math.min(start + maxChars, normalized.length);
    let end = hardEnd;

    if (respectBoundaries && hardEnd < normalized.length) {
      const window = normalized.slice(start, hardEnd);
      const paraBreak = window.lastIndexOf("\n\n");
      if (paraBreak > minBoundaryPos) {
        end = start + paraBreak + 2;
      } else {
        const sentenceBreak = Math.max(
          window.lastIndexOf(". "),
          window.lastIndexOf("! "),
          window.lastIndexOf("? "),
          window.lastIndexOf("\n"),
        );
        if (sentenceBreak > minBoundaryPos) {
          end = start + sentenceBreak + 2;
        }
      }
    }

    const piece = normalized.slice(start, end).trim();
    if (piece.length > 0) chunks.push(piece);

    if (end >= normalized.length) break;
    const nextStart = end - overlapChars;
    // Guarantee forward progress even if overlap >= chunk content.
    start = nextStart > start ? nextStart : start + 1;
  }

  return chunks;
}
