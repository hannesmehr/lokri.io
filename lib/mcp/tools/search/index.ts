/**
 * Federation-Entrypoint: `runUnifiedSearch()`.
 *
 * Wird vom `search`-MCP-Tool in `lib/mcp/tools.ts` gerufen. Orchestriert:
 *
 *   1. Internal: `internalSearch()` (pgvector)
 *   2. External sources: `listExternalSourcesForSpaces()` → pro Source
 *      `externalSearch()` (via Gateway) mit 5s-Timeout + Concurrency-
 *      Limit von 4 parallelen Calls
 *   3. `aggregateResults()` — Per-Source-Cap, Dedup, Hybrid-Score, Sort
 *
 * Returnt eine Shape, die der MCP-Tool-Handler direkt in `ok()` werfen
 * kann — inkl. `degraded_sources`-Metadata.
 *
 * **Abort-Modell:** Pro External-Source ein `AbortController`. Ein
 * 5s-`setTimeout` ruft `controller.abort()` — der Signal propagiert
 * bis zum `fetch`, der Upstream-Request wird tatsächlich gestoppt
 * (kein Background-Request, der den Socket blockiert).
 *
 * **Concurrency-Limit = 4:** Sonst würde ein User mit 20 gemappten
 * Spaces 20 parallele Upstream-Calls loslösen — API-Rate-Limits,
 * Resource-Exhaustion, `maxDuration`-Überschreitung. Begrenzung auf
 * 4 hält den Worst-Case bei `ceil(N/4) * 5s` (= 25s bei 20 Sources),
 * gut unter `maxDuration = 60s`. Interne Suche läuft immer zusätzlich
 * und unabhängig parallel.
 *
 * Wenn `spaceScope: null` ist (unrestricted Token): wir brauchen trotzdem
 * eine konkrete Space-Liste für den External-Lookup. Lokri's interne
 * Suche kann Team-weit laufen (kein Space-Filter), aber
 * `listExternalSourcesForSpaces([])` liefert leere Liste. Daher: wir
 * laden die Team-Spaces, wenn der Scope null ist.
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { spaces } from "@/lib/db/schema";
import { listExternalSourcesForSpaces } from "@/lib/connectors/mappings";
import { aggregateResults, type AggregatedSearchResult } from "./aggregate";
import { withConcurrencyLimit } from "./concurrency";
import {
  externalSearch,
  type ExternalSearchOutcome,
  type ExternalSource,
} from "./external";
import { internalSearch } from "./internal";

export {
  internalSearch,
  type InternalSearchHit,
  type InternalSearchInput,
} from "./internal";
export {
  externalSearch,
  type ExternalSearchHit,
  type ExternalSearchOutcome,
  type ExternalSource,
  type ExternalSearchCaller,
} from "./external";
export {
  aggregateResults,
  type AggregatedSearchResult,
  type DegradedSource,
  type UnifiedSearchResult,
} from "./aggregate";

/**
 * Federation-Defaults. Exportiert, damit Tests die Werte nicht
 * duplizieren müssen — einziger Ort, wo sie stehen.
 */
export const EXTERNAL_SEARCH_CONCURRENCY = 4;
export const EXTERNAL_SEARCH_TIMEOUT_MS = 5_000;

export interface RunUnifiedSearchInput {
  ownerAccountId: string;
  userId: string | null;
  spaceScope: string[] | null;
  query: string;
  limit: number;
}

/** Test-Override für den Internals-Runner. Prod nutzt Defaults. */
export interface RunUnifiedSearchOptions {
  concurrency?: number;
  timeoutMs?: number;
  /** DI für Tests: Override des externalSearch-Workers. Standard-
   *  Callsite nutzt den produktiven `externalSearch`-Import. */
  externalWorker?: (
    source: ExternalSource,
    query: string,
    limit: number,
    caller: { ownerAccountId: string; userId: string | null },
    options: { abortSignal?: AbortSignal },
  ) => Promise<ExternalSearchOutcome>;
}

async function resolveSpaceIds(
  ownerAccountId: string,
  spaceScope: string[] | null,
): Promise<string[]> {
  if (spaceScope && spaceScope.length > 0) return spaceScope;
  // Unrestricted → alle Team-Spaces fürs External-Lookup
  const rows = await db
    .select({ id: spaces.id })
    .from(spaces)
    .where(eq(spaces.ownerAccountId, ownerAccountId));
  return rows.map((r) => r.id);
}

export { withConcurrencyLimit } from "./concurrency";

/** Erzeugt pro Source einen Controller + Timeout, ruft
 *  `externalSearch` mit dem Signal. `finally` räumt den Timer auf.
 *  Wenn externalSearch wider Erwarten doch throwt, wird's hier
 *  zu einer failure-Outcome. */
async function runOneExternalWithTimeout(
  source: ExternalSource,
  query: string,
  limit: number,
  caller: { ownerAccountId: string; userId: string | null },
  timeoutMs: number,
  worker: NonNullable<RunUnifiedSearchOptions["externalWorker"]>,
): Promise<ExternalSearchOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await worker(source, query, limit, caller, {
      abortSignal: controller.signal,
    });
  } catch (err) {
    return {
      status: "failure",
      hits: [],
      sourceLabel: source.integration.displayName,
      reason: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function runUnifiedSearch(
  input: RunUnifiedSearchInput,
  options: RunUnifiedSearchOptions = {},
): Promise<AggregatedSearchResult> {
  const { ownerAccountId, userId, spaceScope, query, limit } = input;
  const concurrency = options.concurrency ?? EXTERNAL_SEARCH_CONCURRENCY;
  const timeoutMs = options.timeoutMs ?? EXTERNAL_SEARCH_TIMEOUT_MS;
  const worker = options.externalWorker ?? externalSearch;

  const spaceIds = await resolveSpaceIds(ownerAccountId, spaceScope);
  const externalSources = await listExternalSourcesForSpaces(spaceIds);

  // Internal läuft unabhängig und ohne Concurrency-Limit (einziger
  // lokri-interner DB-Call, nicht upstream-gebunden). External läuft
  // parallel dazu, aber intern begrenzt auf `concurrency`.
  const [internalHits, externalSettled] = await Promise.all([
    internalSearch({ ownerAccountId, spaceScope, query, limit }),
    withConcurrencyLimit(externalSources, concurrency, (source) =>
      runOneExternalWithTimeout(
        source,
        query,
        limit,
        { ownerAccountId, userId },
        timeoutMs,
        worker,
      ),
    ),
  ]);

  // `runOneExternalWithTimeout` catcht intern — `settled.rejected`-
  // Pfad ist defensiv für den Fall, dass die Worker-Signature mal
  // anders throwt. Dann bauen wir synthetisches failure-Outcome.
  const externalOutcomes: ExternalSearchOutcome[] = externalSettled.map(
    (r, i) => {
      if (r.status === "fulfilled") return r.value;
      return {
        status: "failure" as const,
        hits: [],
        sourceLabel: externalSources[i].integration.displayName,
        reason:
          r.reason instanceof Error ? r.reason.message : String(r.reason),
      };
    },
  );

  return aggregateResults({
    internalHits,
    external: externalOutcomes,
    limit,
  });
}
