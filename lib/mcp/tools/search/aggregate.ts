/**
 * Aggregator für Unified-Search.
 *
 * Inputs:
 *   - `internalHits`: pgvector-Ergebnisse aus lokri-Notes + File-Chunks
 *   - `external`: ein Array von `ExternalSearchOutcome` (pro Source eins)
 *
 * Verantwortung:
 *   1. Per-Source-Cap: max `PER_SOURCE_CAP` Hits pro Quelle
 *   2. Hybrid-Score: interne Similarity + externe RawScore werden auf
 *      [0, 1] normalisiert und dann als einheitlicher `score` exponiert.
 *      Normalisierungs-Modus ist pragmatisch (min-max pro Quelle) —
 *      kein tiefes Relevance-Tuning im MVP
 *   3. Dedup anhand von `id` (interner `note:…`/`file_chunk:…`-Prefix
 *      + externer `confluence:…` macht Cross-Source-Collisions praktisch
 *      unmöglich, aber idempotent gegen Duplikate aus derselben Quelle)
 *   4. Gesamtsortierung nach `score` absteigend, dann `limit`
 *   5. Degradation-Info: Liste der nicht-erreichbaren Quellen mit Grund
 */

import type { InternalSearchHit } from "./internal";
import type {
  ExternalSearchHit,
  ExternalSearchOutcome,
} from "./external";

const PER_SOURCE_CAP = 20;

export interface UnifiedSearchResult {
  /** Einheitlicher Discriminator: `"lokri"` oder Connector-Typ-Slug. */
  source: string;
  /** User-facing Label — bei lokri `"lokri"`, bei External der
   *  Integration-Name. */
  sourceLabel: string;
  /** Eindeutig innerhalb der Federation. Prefix kommt aus der Quelle. */
  id: string;
  type: string;
  title: string;
  snippet: string;
  /** Leere URL bei internen Hits — der MCP-Client nutzt `fetch` mit der
   *  `id`, um den Content zu holen. */
  url: string;
  /** Normalisiert auf [0, 1], 1 = bester Treffer seiner Quelle. */
  score: number;
  /** Roher Score für Debug/Diagnostik. */
  rawScore: number;
  metadata?: Record<string, unknown>;
}

export interface DegradedSource {
  sourceLabel: string;
  reason: string;
}

export interface AggregatedSearchResult {
  results: UnifiedSearchResult[];
  degradedSources: DegradedSource[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Min-Max-Normalisierung pro Quelle auf [0, 1]. Degeneriert auf 0.5
 *  wenn alle Werte gleich sind (statt Division durch 0). */
function normalizeScores(values: number[]): number[] {
  if (values.length === 0) return [];
  let min = values[0];
  let max = values[0];
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min;
  if (range === 0) return values.map(() => 0.5);
  return values.map((v) => (v - min) / range);
}

function capTake<T>(items: T[], cap: number): T[] {
  return items.length <= cap ? items : items.slice(0, cap);
}

// ---------------------------------------------------------------------------
// aggregate
// ---------------------------------------------------------------------------

export interface AggregateInput {
  internalHits: InternalSearchHit[];
  external: ExternalSearchOutcome[];
  limit: number;
}

export function aggregateResults(
  input: AggregateInput,
): AggregatedSearchResult {
  const { internalHits, external, limit } = input;

  // --- Internal ---
  const internalCapped = capTake(
    [...internalHits].sort((a, b) => b.similarity - a.similarity),
    PER_SOURCE_CAP,
  );
  const internalScoresNorm = normalizeScores(
    internalCapped.map((h) => h.similarity),
  );
  const internalResults: UnifiedSearchResult[] = internalCapped.map(
    (h, i) => ({
      source: "lokri",
      sourceLabel: "lokri",
      id: h.id,
      type: h.type,
      title: h.title,
      snippet: h.snippet,
      url: "",
      score: internalScoresNorm[i],
      rawScore: h.similarity,
    }),
  );

  // --- External (pro Source separat cappen + normalisieren) ---
  const externalResults: UnifiedSearchResult[] = [];
  const degradedSources: DegradedSource[] = [];

  for (const outcome of external) {
    if (outcome.status !== "ok") {
      degradedSources.push({
        sourceLabel: outcome.sourceLabel,
        reason: outcome.reason,
      });
      continue;
    }
    const capped = capTake(
      [...outcome.hits].sort(
        (a, b) => (b.rawScore ?? 0) - (a.rawScore ?? 0),
      ),
      PER_SOURCE_CAP,
    );
    const rawScores = capped.map((h) => h.rawScore ?? 0);
    const normScores = normalizeScores(rawScores);
    for (let i = 0; i < capped.length; i++) {
      const h: ExternalSearchHit = capped[i];
      externalResults.push({
        source: h.source,
        sourceLabel: h.sourceLabel,
        id: h.id,
        type: "external-page",
        title: h.title,
        snippet: h.snippet,
        url: h.url,
        score: normScores[i],
        rawScore: h.rawScore ?? 0,
        metadata: h.metadata,
      });
    }
  }

  // --- Merge + Dedup + Sort + Slice ---
  const byId = new Map<string, UnifiedSearchResult>();
  for (const r of [...internalResults, ...externalResults]) {
    // Idempotent gegen Source-interne Duplikate. Kollisionen zwischen
    // Quellen sind durch Prefix (`note:…` vs `confluence:…`) verhindert
    // — hier primär Safety.
    const existing = byId.get(r.id);
    if (!existing || existing.score < r.score) {
      byId.set(r.id, r);
    }
  }

  const merged = [...byId.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    results: merged,
    degradedSources,
  };
}
