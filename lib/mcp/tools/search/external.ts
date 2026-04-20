/**
 * Connector-Seite der Unified-Search-Federation.
 *
 * Pro gemappter External-Source ein Gateway-Call. Der Gateway handhabt
 * Filter-Pipeline, Usage-Log, Error-Klassifikation. `externalSearch`
 * selbst ist nur Shape-Mapping von `ToolResult` auf die Federation-
 * interne `ExternalSearchHit`-Form.
 *
 * **Abort-Modell:** Der Timeout wird vom Caller (`runUnifiedSearch`)
 * via `AbortController` + `setTimeout(controller.abort, …)` aufgespannt;
 * `externalSearch` reicht den Signal an den Gateway-Call durch und
 * wandelt `signal.aborted` am Catch-Pfad in ein `degraded`-Outcome um.
 * Kein Promise.race, kein hängender Hintergrund-Fetch.
 *
 * **Kein direkter Provider-Call, niemals.** Security-Prinzip: nur via
 * Gateway, damit Pipeline + Audit konsequent greifen. Kein Shortcut
 * für „performance".
 *
 * Confluence-spezifisch: wir importieren `confluenceSearchTool` nur um
 * `extractObservedScopes` zu bekommen. Sobald ein zweiter Connector-
 * Typ dazukommt (Slack, GitHub), entscheidet ein Switch auf
 * `source.integration.connectorType`.
 */

import type { ExecuteConnectorToolInput } from "@/lib/connectors/gateway";
import { confluenceSearchTool } from "@/lib/connectors/providers/confluence-cloud/tools";
import type {
  SearchHit as ConfluenceSearchHit,
  SearchToolData,
} from "@/lib/connectors/providers/confluence-cloud/tools";
import type {
  ConnectorIntegration,
  ConnectorScope,
  SpaceExternalSource,
  ToolResult,
} from "@/lib/connectors/types";

/** Ein einzelnes gemapptes External-Source-Tuple, geliefert von
 *  `listExternalSourcesForSpaces`. */
export interface ExternalSource {
  mapping: SpaceExternalSource;
  scope: ConnectorScope;
  integration: ConnectorIntegration;
}

/** Normalisierter Hit pro External-Source. Aggregator mischt das mit
 *  `InternalSearchHit` und produziert die finale MCP-Response. */
export interface ExternalSearchHit {
  /** Stable ID für `fetch`/Dedup. Bei Confluence: `confluence:<pageId>`. */
  id: string;
  /** Connector-Typ-Slug: `"confluence-cloud"`, später `"slack"`, etc. */
  source: string;
  /** User-facing Label der Integration (`displayName` aus DB). */
  sourceLabel: string;
  title: string;
  snippet: string;
  url: string;
  /** Upstream-Score, **nicht normalisiert**. Der Aggregator normalisiert
   *  beim Merge auf [0, 1]. Null wenn der Upstream keinen liefert. */
  rawScore: number | null;
  /** lokri-Space, in dessen Kontext dieser Hit gefunden wurde. Erlaubt
   *  der UI, einen Hit einem lokri-Space zuzuordnen („stammt aus
   *  Space X"). */
  lokriSpaceId: string;
  /** Provider-spezifische Metadaten (z.B. pageId, spaceKey). Für
   *  `fetch` und Client-side-Display. */
  metadata: Record<string, unknown>;
}

export type ExternalSearchOutcome =
  | { status: "ok"; hits: ExternalSearchHit[]; sourceLabel: string }
  | {
      status: "degraded" | "failure";
      hits: [];
      sourceLabel: string;
      reason: string;
    };

export interface ExternalSearchCaller {
  ownerAccountId: string;
  /** Null für Legacy-Tokens ohne `created_by_user_id`. Wird an den
   *  Gateway weitergereicht und landet im Usage-Log. */
  userId: string | null;
}

export interface ExternalSearchOptions {
  /** Externer Timeout-Signal vom Federation-Layer. `signal.aborted
   *  === true` nach dem await ⇒ wir liefern `degraded`-Outcome mit
   *  Timeout-Reason. */
  abortSignal?: AbortSignal;
  /** Test-Override: statt `executeConnectorToolLive` eine Mock-Funktion.
   *  Produktion nutzt den Default-Live-Pfad. */
  execute?: (input: ExecuteConnectorToolInput) => Promise<ToolResult>;
}

// ---------------------------------------------------------------------------
// Mapping: ToolResult → ExternalSearchOutcome
// ---------------------------------------------------------------------------

function mapConfluenceHits(
  source: ExternalSource,
  data: SearchToolData,
): ExternalSearchHit[] {
  return data.hits.map(
    (h: ConfluenceSearchHit): ExternalSearchHit => ({
      id: `confluence:${h.pageId}`,
      source: "confluence-cloud",
      sourceLabel: source.integration.displayName,
      title: h.title,
      snippet: h.snippet,
      url: h.url,
      rawScore: h.score,
      lokriSpaceId: source.mapping.spaceId,
      metadata: {
        pageId: h.pageId,
        spaceKey: h.spaceKey,
        spaceName: h.spaceName,
        lastModified: h.lastModified,
        integrationId: source.integration.id,
      },
    }),
  );
}

// ---------------------------------------------------------------------------
// externalSearch
// ---------------------------------------------------------------------------

export async function externalSearch(
  source: ExternalSource,
  query: string,
  limit: number,
  caller: ExternalSearchCaller,
  options: ExternalSearchOptions = {},
): Promise<ExternalSearchOutcome> {
  const sourceLabel = source.integration.displayName;
  const abortSignal = options.abortSignal;

  // Connector-Dispatch. Aktuell nur confluence-cloud; Slack/GitHub
  // kommen hier mit eigenen Branches dazu.
  if (source.integration.connectorType !== "confluence-cloud") {
    return {
      status: "failure",
      hits: [],
      sourceLabel,
      reason: `Unsupported connector type for federation: ${source.integration.connectorType}`,
    };
  }

  // Fast-path: wenn der Signal bereits aborted ist (Caller hat noch
  // vor dem Gateway-Call Timeout oder Error gecaught), erspart uns
  // das einen unnötigen Upstream-Call.
  if (abortSignal?.aborted) {
    return {
      status: "degraded",
      hits: [],
      sourceLabel,
      reason: "aborted-before-dispatch",
    };
  }

  // Lazy default import: gateway-live zieht `lib/db` rein, was den
  // Edge-Runtime-freien sowie den Test-Import-Graph kaputt machen
  // würde. Der static `import type { ExecuteConnectorToolInput }`
  // bleibt OK (TypeScript-Type-only, wird gestript).
  const execute =
    options.execute ??
    (await import("@/lib/connectors/gateway-live")).executeConnectorToolLive;

  const args = { query, limit };
  const scopeRef = {
    type: "confluence-space",
    identifier: source.scope.scopeIdentifier,
  };

  const input: ExecuteConnectorToolInput = {
    ownerAccountId: source.integration.ownerAccountId,
    integrationId: source.integration.id,
    toolName: "search",
    args,
    callerUserId: caller.userId,
    spaceId: source.mapping.spaceId,
    // Pre-Filter: gleicher Scope wie der Mapping-Eintrag.
    requiredScopes: [scopeRef],
    // Nur der eine Scope in context.scopes — das Confluence-CQL wird
    // damit auf genau diesen Space eingegrenzt.
    scopeIds: [source.scope.id],
    extractObservedScopes: (result: ToolResult) =>
      confluenceSearchTool.extractObservedScopes(result),
    abortSignal,
  };

  let result: ToolResult;
  try {
    result = await execute(input);
  } catch (err) {
    // Abort-Pfad: der Gateway hat entweder ConnectorUpstreamError aus
    // einem AbortError erzeugt, oder der Fetch wurde direkt gestoppt.
    // Wir unterscheiden hier den Grund:
    if (abortSignal?.aborted) {
      return {
        status: "degraded",
        hits: [],
        sourceLabel,
        reason: "timeout-or-aborted",
      };
    }
    // Nicht-abortbezogene Errors behandeln wir weiterhin als failure —
    // Gateway rethrowt bei unclassified errors, die wollen wir nicht
    // die ganze Federation kippen lassen.
    return {
      status: "failure",
      hits: [],
      sourceLabel,
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  // Gateway hat einen AbortError zum degraded-ToolResult gemacht —
  // Signal-State hat Vorrang für die reason-Attribution.
  if (abortSignal?.aborted && result.status !== "success") {
    return {
      status: "degraded",
      hits: [],
      sourceLabel,
      reason: "timeout-or-aborted",
    };
  }

  if (result.status === "success") {
    return {
      status: "ok",
      sourceLabel,
      hits: mapConfluenceHits(source, result.data as SearchToolData),
    };
  }

  if (result.status === "degraded") {
    return {
      status: "degraded",
      hits: [],
      sourceLabel,
      reason: result.reason ?? "degraded",
    };
  }

  return {
    status: "failure",
    hits: [],
    sourceLabel,
    reason: result.reason ?? "failure",
  };
}
