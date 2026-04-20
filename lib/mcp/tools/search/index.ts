/**
 * Federation-Entrypoint: `runUnifiedSearch()`.
 *
 * Wird vom `search`-MCP-Tool in `lib/mcp/tools.ts` gerufen. Orchestriert:
 *
 *   1. Internal: `internalSearch()` (pgvector)
 *   2. External sources: `listExternalSourcesForSpaces()` → pro Source
 *      `externalSearch()` (via Gateway)
 *   3. `aggregateResults()` — Per-Source-Cap, Dedup, Hybrid-Score, Sort
 *
 * Returnt eine Shape, die der MCP-Tool-Handler direkt in `ok()` werfen
 * kann — inkl. `degraded_sources`-Metadata.
 *
 * Parallel-Dispatch via `Promise.allSettled`. Wenn ein External-Call
 * crasht, geht die Federation weiter; der Aggregator erfasst's als
 * degraded source.
 *
 * Wenn `spaceScope: null` ist (unrestricted Token): wir brauchen trotzdem
 * eine konkrete Space-Liste für den External-Lookup. Lokri's interne
 * Suche kann Team-weit laufen (kein Space-Filter), aber
 * `listExternalSourcesForSpaces([])` liefert leere Liste. Daher: wir
 * laden die Team-Spaces, wenn der Scope null ist.
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { spaces } from "@/lib/db/schema";
import { listExternalSourcesForSpaces } from "@/lib/connectors/mappings";
import { aggregateResults, type AggregatedSearchResult } from "./aggregate";
import {
  externalSearch,
  type ExternalSearchOutcome,
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

export interface RunUnifiedSearchInput {
  ownerAccountId: string;
  userId: string | null;
  spaceScope: string[] | null;
  query: string;
  limit: number;
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

export async function runUnifiedSearch(
  input: RunUnifiedSearchInput,
): Promise<AggregatedSearchResult> {
  const { ownerAccountId, userId, spaceScope, query, limit } = input;

  // Space-Liste für External-Lookup auflösen
  const spaceIds = await resolveSpaceIds(ownerAccountId, spaceScope);
  const externalSources = await listExternalSourcesForSpaces(spaceIds);

  // Internal + alle External parallel. Internal erwartet den originalen
  // spaceScope (null/Array), nicht die aufgelöste Liste.
  const [internalHits, ...externalOutcomes] = await Promise.all([
    internalSearch({ ownerAccountId, spaceScope, query, limit }),
    ...externalSources.map((source) =>
      externalSearch(source, query, limit, {
        ownerAccountId,
        userId,
      }).catch<ExternalSearchOutcome>((err) => ({
        status: "failure",
        hits: [],
        sourceLabel: source.integration.displayName,
        reason: err instanceof Error ? err.message : String(err),
      })),
    ),
  ]);

  return aggregateResults({
    internalHits,
    external: externalOutcomes,
    limit,
  });
}
