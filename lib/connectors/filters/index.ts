/**
 * Filter-Pipeline Re-Exports + MVP-Pipeline-Konstante.
 *
 * Der Gateway (Block 2) ruft `runPipeline(MVP_PIPELINE, …)` auf. Die
 * Konstante lebt hier statt im Gateway, damit neue Connector-Provider
 * bei Bedarf die Pipeline-Komposition variieren können — z.B. für
 * OAuth-Connectors einen Token-Refresh-Filter vorschalten.
 *
 * Reihenfolge für MVP: scope-enforcement → (inner) → scope-post.
 * Audit-/Usage-Log läuft NICHT hier — siehe `filters/types.ts`.
 */

export type {
  ConnectorFilter,
  InnerExecution,
  RequestContext,
  ResponseContext,
  ScopeRef,
} from "./types";
export { runPipeline } from "./pipeline";
export { scopeEnforcementFilter } from "./scope-enforcement";
export { scopePostFilter } from "./scope-post";

import { scopeEnforcementFilter } from "./scope-enforcement";
import { scopePostFilter } from "./scope-post";
import type { ConnectorFilter } from "./types";

export const MVP_PIPELINE: readonly ConnectorFilter[] = [
  scopeEnforcementFilter,
  scopePostFilter,
];
