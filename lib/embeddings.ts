import { embed, embedMany } from "ai";

/**
 * Default embedding model. `openai/text-embedding-3-small` is routed through
 * the Vercel AI Gateway (requires `AI_GATEWAY_API_KEY`) and emits 1536-dim
 * vectors, matching the `vector(1536)` columns on `file_chunks` and `notes`.
 */
export const DEFAULT_EMBEDDING_MODEL = "openai/text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

export interface EmbedResult {
  embedding: number[];
  model: string;
}

export interface EmbedManyResult {
  embeddings: number[][];
  model: string;
}

/** Embed a single string. Returns the vector + the model id that produced it. */
export async function embedText(
  text: string,
  model: string = DEFAULT_EMBEDDING_MODEL,
): Promise<EmbedResult> {
  const { embedding } = await embed({ model, value: text });
  return { embedding, model };
}

/** Batch-embed. Gateway handles parallelism; most providers cap at ~100/call. */
export async function embedTexts(
  texts: string[],
  model: string = DEFAULT_EMBEDDING_MODEL,
): Promise<EmbedManyResult> {
  if (texts.length === 0) return { embeddings: [], model };
  const { embeddings } = await embedMany({ model, values: texts });
  return { embeddings, model };
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
