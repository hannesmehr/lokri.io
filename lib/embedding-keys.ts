import { createOpenAI, type OpenAIProvider } from "@ai-sdk/openai";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { embeddingKeys } from "@/lib/db/schema";
import { decryptJson } from "@/lib/storage/encryption";

/** Embedding-model instance returned by `OpenAIProvider.textEmbeddingModel`. */
type EmbeddingModel = ReturnType<OpenAIProvider["textEmbeddingModel"]>;

/**
 * BYOK routing for embeddings. When an owner account has a row in
 * `embedding_keys`, we instantiate the upstream provider directly with
 * their API key and bypass the Vercel AI Gateway. Otherwise we fall back
 * to the gateway-routed default model id (`openai/text-embedding-3-small`
 * — the prefix tells the `ai` SDK to look for `AI_GATEWAY_API_KEY`).
 *
 * Hard constraint: every supported model MUST produce 1536-dim vectors.
 * The `notes.embedding` + `file_chunks.embedding` columns are typed
 * `vector(1536)` and any mismatch breaks inserts at the DB layer.
 */

/** Canonical fallback routed through the AI Gateway. */
export const DEFAULT_GATEWAY_MODEL = "openai/text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

/** Allowlist — every entry must emit 1536-dim vectors. */
export const ALLOWED_BYOK_MODELS = {
  openai: new Set([
    "text-embedding-3-small",
    "text-embedding-ada-002",
  ]),
} as const;

export type EmbeddingProviderKind = keyof typeof ALLOWED_BYOK_MODELS;

interface KeyConfig {
  apiKey: string;
}

export interface EmbeddingContext {
  /** Either an EmbeddingModel instance (BYOK) or a string id (Gateway). */
  model: EmbeddingModel | string;
  /** Human-readable id persisted on the embedded rows. */
  modelId: string;
  /** True when the user's own key is in play (skips the AI Gateway). */
  byok: boolean;
}

/**
 * Resolve which embedding model to use for this account. Called by
 * `embedText` / `embedTexts` on every call. One DB hit per embed — cheap
 * (indexed by `owner_account_id`), and embeddings already dominate the
 * latency budget by an order of magnitude.
 *
 * `ownerAccountId` is optional so background scripts / the REPL can still
 * call the helpers without an account context.
 */
export async function getEmbeddingContext(
  ownerAccountId?: string,
): Promise<EmbeddingContext> {
  if (!ownerAccountId) {
    return { model: DEFAULT_GATEWAY_MODEL, modelId: DEFAULT_GATEWAY_MODEL, byok: false };
  }

  const [row] = await db
    .select({
      id: embeddingKeys.id,
      provider: embeddingKeys.provider,
      model: embeddingKeys.model,
      configEncrypted: embeddingKeys.configEncrypted,
    })
    .from(embeddingKeys)
    .where(eq(embeddingKeys.ownerAccountId, ownerAccountId))
    .limit(1);

  if (!row) {
    return { model: DEFAULT_GATEWAY_MODEL, modelId: DEFAULT_GATEWAY_MODEL, byok: false };
  }

  const config = decryptJson<KeyConfig>(row.configEncrypted);

  // Fire-and-forget last_used_at update — avoids a second round-trip on
  // the hot path.
  db.update(embeddingKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(embeddingKeys.id, row.id))
    .catch((err) => {
      console.error("[embedding-keys] last_used_at update failed:", err);
    });

  if (row.provider === "openai") {
    const provider = createOpenAI({ apiKey: config.apiKey });
    return {
      model: provider.textEmbeddingModel(row.model),
      modelId: `openai/${row.model}`,
      byok: true,
    };
  }

  // Unknown provider — shouldn't happen because the enum is exhaustive,
  // but guard anyway.
  return { model: DEFAULT_GATEWAY_MODEL, modelId: DEFAULT_GATEWAY_MODEL, byok: false };
}

/**
 * Live connectivity check used by the "Test & Save" UI flow. Runs a tiny
 * embed call with the supplied key/model and verifies the vector has the
 * expected width — catches wrong model ids, expired keys, and dimension
 * mismatches before we persist.
 */
export async function testEmbeddingKey(
  provider: EmbeddingProviderKind,
  model: string,
  apiKey: string,
): Promise<void> {
  const allowed = ALLOWED_BYOK_MODELS[provider];
  if (!allowed.has(model)) {
    throw new Error(
      `Modell "${model}" ist nicht erlaubt — muss 1536-dim emittieren. Unterstützt: ${[...allowed].join(", ")}.`,
    );
  }
  const p = createOpenAI({ apiKey });
  const { embed } = await import("ai");
  const { embedding } = await embed({
    model: p.textEmbeddingModel(model),
    value: "lokri connectivity test",
  });
  if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Modell liefert ${embedding?.length ?? "?"} Dimensionen, erwartet ${EMBEDDING_DIMENSIONS}.`,
    );
  }
}
