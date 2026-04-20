/**
 * Filter-Pipeline-Runner.
 *
 * Durchlaufsequenz:
 *   1. `filters[*].requestPhase` in Reihenfolge
 *   2. `inner(reqCtx)` — der Upstream-Call, typischerweise
 *      `provider.executeTool(...)` mit Observable-Scopes-Extraktion
 *   3. `filters[*].responsePhase` in Reihenfolge
 *
 * Short-Circuit:
 *   - Ein Pre-Filter darf throwen (typischerweise `ConnectorScopeError`).
 *     Der Inner läuft dann nicht, kein Post-Filter läuft. Der Caller
 *     (Gateway) catcht, loggt `status: failure`, liefert degraded result
 *     an den MCP-Client.
 *   - Der Inner darf throwen (Upstream-Fehler, Auth-Fehler). Post-Filter
 *     laufen *nicht* — die Response existiert ja nicht. Auch hier: der
 *     Gateway catcht.
 *   - Ein Post-Filter darf throwen (`ConnectorScopePostError` — Leak).
 *     Gateway catcht, loggt `status: failure`, wirft Alarm.
 *
 * Wir starten absichtlich keine Filter parallel — die MVP-Filter sind
 * O(N)-Scope-Checks gegen eine kleine Menge, Parallelisierung ist
 * Premature Optimization und macht Reihenfolge-Contracts unklar.
 */

import type { ConnectorFilter, InnerExecution, RequestContext, ResponseContext } from "./types";

export async function runPipeline(
  filters: readonly ConnectorFilter[],
  initial: RequestContext,
  inner: (ctx: RequestContext) => Promise<InnerExecution>,
): Promise<ResponseContext> {
  // Pre-Filter
  let reqCtx = initial;
  for (const filter of filters) {
    if (filter.requestPhase) {
      reqCtx = await filter.requestPhase(reqCtx);
    }
  }

  // Inner
  const { result, observedScopes } = await inner(reqCtx);

  // Response-Kontext initialisieren
  let resCtx: ResponseContext = {
    toolName: reqCtx.toolName,
    args: reqCtx.args,
    executionContext: reqCtx.executionContext,
    result,
    observedScopes,
  };

  // Post-Filter
  for (const filter of filters) {
    if (filter.responsePhase) {
      resCtx = await filter.responsePhase(resCtx);
    }
  }

  return resCtx;
}
