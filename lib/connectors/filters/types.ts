/**
 * Filter-Pipeline — Kontext-Typen.
 *
 * Eine Pipeline läuft in drei Abschnitten:
 *
 *   1. Pre (Request-Phase):  Filter.requestPhase — reihenfolgetreu.
 *   2. Inner (Upstream-Call): Provider.executeTool — nicht als Filter.
 *   3. Post (Response-Phase): Filter.responsePhase — reihenfolgetreu.
 *
 * Der MVP hat nur zwei Filter:
 *   - `scopeEnforcementFilter` (pre) — blockt vor dem Upstream-Call
 *   - `scopePostFilter` (post)  — Defense-in-Depth
 *
 * Das Audit-/Usage-Log wird NICHT als Filter realisiert, sondern aus
 * dem Gateway (`executeConnectorTool` in Block 2) orchestriert — so
 * landen auch Fehler-Pfade konsistent im Log, auch wenn die Pipeline
 * throwt bevor sie Post erreicht.
 *
 * Ein Filter darf synchron oder asynchron laufen; die Pipeline awaited
 * in jedem Fall. Ein Filter darf den Context mutieren und zurückgeben
 * oder einen neuen Context bauen — beide Wege sind legal.
 *
 * Short-Circuit: Ein Filter signalisiert Abbruch über `throw` mit
 * einem `ConnectorError`. Es gibt keinen `FilterBlock`-Sentinel —
 * Errors sind für diesen Fall präziser (Stack-Trace, typed catch).
 */

import type { ExecutionContext, ToolResult } from "../types";

/**
 * Minimaler Scope-Verweis, wie ihn Filter und Gateway austauschen.
 * Entspricht `{scope_type, scope_identifier}` aus `connector_scope_allowlist`
 * — aber ohne DB-Row-Overhead (keine id, keine FK).
 */
export interface ScopeRef {
  type: string;
  identifier: string;
}

/**
 * Request-Phase-Context. Der Gateway baut das aus Tool-Dispatch + DB-
 * Daten zusammen, reicht es durch Pre-Filter durch und übergibt den
 * final-Zustand dann an den Provider.
 */
export interface RequestContext {
  toolName: string;
  args: unknown;
  executionContext: ExecutionContext;
  /**
   * Welche Scopes der Request anfasst. Vom Gateway populiert aus tool-
   * spezifischer Logik (z.B. "search" → alle Scopes der Integration;
   * "confluence-read-page" → der Scope zum Space des Page-IDs).
   *
   * Leer ⇒ der Filter prüft nichts. Das ist ok für Tools, die keinen
   * scoped Input haben (z.B. rein metadata-basierte Listings), aber
   * selten — fehlendes Populieren ist wahrscheinlicher ein Gateway-Bug.
   */
  requiredScopes: ScopeRef[];
}

export interface ResponseContext {
  toolName: string;
  args: unknown;
  executionContext: ExecutionContext;
  result: ToolResult;
  /**
   * Welche Scopes tatsächlich in der Response auftauchen. Vom Provider-
   * Adapter (nicht vom Provider selbst) populiert, indem er die
   * Upstream-Response traversiert und `space_key`/`repo`/... extrahiert.
   *
   * `scopePostFilter` prüft: jede beobachtete Scope muss in
   * `executionContext.scopes` sein. Andernfalls → `ConnectorScopePostError`.
   */
  observedScopes: ScopeRef[];
}

export interface ConnectorFilter {
  readonly name: string;
  requestPhase?(
    ctx: RequestContext,
  ): RequestContext | Promise<RequestContext>;
  responsePhase?(
    ctx: ResponseContext,
  ): ResponseContext | Promise<ResponseContext>;
}

/**
 * Rückgabe des Inner-Handlers. Trennt `result` (was an den MCP-Client
 * zurück geht) von `observedScopes` (für den Post-Filter).
 */
export interface InnerExecution {
  result: ToolResult;
  observedScopes: ScopeRef[];
}
