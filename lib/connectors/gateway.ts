/**
 * Connector-Gateway — `executeConnectorTool()`.
 *
 * Das ist der eine Einstiegspunkt für Tool-Handler, um einen MCP-Call
 * gegen eine Connector-Integration laufen zu lassen. Zuständig für:
 *
 *   1. Integration laden (scoped auf den Team-Account)
 *   2. Provider aus der Registry ziehen
 *   3. Scope-Allowlist laden, Execution-Context bauen
 *   4. Pipeline ausführen (scope-enforcement → executeTool → scope-post)
 *   5. Fehler klassifizieren → `ToolResult` + Usage-Log-Status
 *   6. `recordUsage()` **immer** aus dem finally-Block schreiben —
 *      auch bei Fehlern. Das Audit-Log darf nie Lücken haben.
 *   7. Bei Auth-Fehler: `connector_integrations.last_error` setzen,
 *      damit das UI einen „Token erneuern"-Hinweis zeigen kann.
 *
 * **DI-Design.** Alles, was DB anfasst, läuft über `GatewayOps`-
 * Injection. Der Gateway selbst importiert *nur* DB-freie Module
 * (Registry, Filter-Pipeline, Errors, Sanitize). Das hat zwei Gründe:
 *
 *   - Tests: ohne Test-DB-Harness in diesem Projekt müssen wir mit
 *     Mock-Ops arbeiten. DI macht das trivial.
 *   - Edge-Runtime: ein zukünftiger Edge-Deploy könnte den Gateway
 *     importieren ohne den Neon-Client zu pullen. (Block-2-Scope:
 *     noch nicht genutzt, aber wir verbauen's nicht.)
 *
 * Produktive Caller nutzen `executeConnectorToolLive` aus
 * `gateway-live.ts`, das die echten CRUD-Helpers injiziert.
 *
 * **Error-Handling-Kontrakt:**
 *   - `ConnectorScopeError`       → `failure` (Pre-Filter blockt)
 *   - `ConnectorScopePostError`   → `failure` (Leak, ernst — Log-Message
 *                                    prefixt mit `[scope-post-leak]`)
 *   - `ConnectorAuthError`        → `failure` + persist auf
 *                                    `integration.last_error`
 *   - `ConnectorUpstreamError`    → `degraded` (lokri-Side liefert
 *                                    trotzdem; Caller baut teilweise
 *                                    Response)
 *   - sonstiger `ConnectorError`  → `failure`
 *   - fremder Error               → `failure` geloggt, **re-thrown**
 *                                    (Programmier-Bug; wir wollen den
 *                                    Stack-Trace sehen)
 *
 * Integration nicht gefunden ⇒ `ConnectorConfigError` (wird *nicht*
 * geloggt — ohne Integration-Row fehlt der Audit-Anker). Disabled-
 * Integration ⇒ `failure` *mit* Log.
 */

import {
  ConnectorAuthError,
  ConnectorConfigError,
  ConnectorError,
  ConnectorScopeError,
  ConnectorScopePostError,
  ConnectorUpstreamError,
} from "./errors";
import {
  MVP_PIPELINE,
  runPipeline,
  type RequestContext,
  type ScopeRef,
} from "./filters";
import type { ConnectorProvider } from "./provider";
import { get as getConnectorProvider } from "./registry";
import { sanitizeArgs } from "./sanitize";
import type {
  ConnectorIntegration,
  ConnectorScope,
  ExecutionContext,
  ToolResult,
} from "./types";
import type { RecordUsageInput, UsageLogStatus } from "./usage-log";

export interface ExecuteConnectorToolInput {
  ownerAccountId: string;
  integrationId: string;
  toolName: string;
  args: unknown;
  /** Null bei Legacy-Tokens ohne `created_by_user_id`; Usage-Log
   *  handhabt null sauber (FK `set null`). */
  callerUserId: string | null;
  /** lokri-Space im Kontext des Calls. Null für Tools, die keinen
   *  konkreten Space-Kontext haben (z.B. MCP-Client fragt eine
   *  External-Page ohne lokri-Space-Attribution). Landet im Usage-Log
   *  als `space_id` (dort auch nullable, FK `set null`). */
  spaceId: string | null;
  /**
   * Scopes, die dieser Call anfassen will. Vom Tool-Handler populiert.
   * Leer ⇒ keine Pre-Filter-Prüfung (Defense-in-Depth via Post-Filter
   * bleibt aktiv, falls `extractObservedScopes` populiert).
   */
  requiredScopes: ScopeRef[];
  /**
   * Scope-Subset, das der Provider in `ExecutionContext.scopes` sieht.
   * Der Gateway lädt alle Scopes der Integration und filtert auf diese
   * IDs — so sieht ein space-mapping-Tool wie `read-page` nur die
   * Scopes, die zum Request-lokri-Space gemappt sind, nicht die
   * gesamte Integration-Allowlist.
   *
   * - `undefined` ⇒ alle Scopes der Integration sind sichtbar
   *   (Unified-Search, wenn der Caller auf Mapping-Ebene bereits
   *   gefiltert hat; siehe search/external.ts)
   * - `[]` (leerer Array) ⇒ keine Scopes. Der Tool erhält eine leere
   *   `context.scopes` und entscheidet selbst (z.B. Confluence-search
   *   returnt leere Hits sofort ohne Upstream-Call).
   */
  scopeIds?: string[];
  /**
   * Optional: extrahiert Scope-Refs aus der Tool-Response für den
   * Post-Filter. Connector-spezifisch (z.B. für Confluence-search:
   * hit.space.key aus jedem Hit ziehen).
   */
  extractObservedScopes?: (result: ToolResult) => ScopeRef[];
  /**
   * Externer AbortSignal. Wird in den ExecutionContext geschoben;
   * Provider reicht ihn an seinen HTTP-Client. Federation-Layer
   * nutzt das für hart durchgesetzten 5s-Timeout pro Source (siehe
   * `runUnifiedSearch`). Aborted-Signal ⇒ Upstream-Client wirft
   * `ConnectorUpstreamError` mit `AbortError` als cause ⇒ Gateway
   * klassifiziert als `degraded`.
   */
  abortSignal?: AbortSignal;
}

/**
 * DB-touching Dependencies. Produktiv gebunden in `gateway-live.ts`,
 * in Tests durch Mocks ersetzt.
 */
export interface GatewayOps {
  loadIntegration(
    integrationId: string,
    ownerAccountId: string,
  ): Promise<ConnectorIntegration | null>;
  loadScopes(integrationId: string): Promise<ConnectorScope[]>;
  recordUsage(input: RecordUsageInput): Promise<void>;
  recordIntegrationError(
    integrationId: string,
    message: string,
  ): Promise<void>;
  /** Default: `getConnectorProvider` aus der Registry. Override in
   *  Tests, um die globale Registry zu umgehen. */
  getProvider?(connectorType: string): ConnectorProvider;
}

interface ErrorClassification {
  status: UsageLogStatus;
  /** Message fürs Audit-Log (`response_metadata.error`). */
  logMessage: string;
  /** Was an den Caller zurückgeht. */
  result: ToolResult;
  /** `integration.last_error` nachschreiben? */
  persistOnIntegration: boolean;
  /** Soll der Gateway den Original-Error re-throwen? */
  rethrow: boolean;
}

function classifyError(err: unknown): ErrorClassification {
  if (err instanceof ConnectorScopeError) {
    return {
      status: "failure",
      logMessage: err.message,
      result: { status: "failure", data: null, reason: err.message },
      persistOnIntegration: false,
      rethrow: false,
    };
  }
  if (err instanceof ConnectorScopePostError) {
    return {
      status: "failure",
      // Prefix macht Post-Leaks in Log-Greps offensichtlich.
      logMessage: `[scope-post-leak] ${err.message}`,
      result: {
        status: "failure",
        data: null,
        reason: "Response withheld by scope-post filter",
      },
      persistOnIntegration: false,
      rethrow: false,
    };
  }
  if (err instanceof ConnectorAuthError) {
    return {
      status: "failure",
      logMessage: err.message,
      result: { status: "failure", data: null, reason: err.message },
      persistOnIntegration: true,
      rethrow: false,
    };
  }
  if (err instanceof ConnectorUpstreamError) {
    return {
      status: "degraded",
      logMessage: err.message,
      result: { status: "degraded", data: null, reason: err.message },
      persistOnIntegration: false,
      rethrow: false,
    };
  }
  if (err instanceof ConnectorError) {
    return {
      status: "failure",
      logMessage: err.message,
      result: { status: "failure", data: null, reason: err.message },
      persistOnIntegration: false,
      rethrow: false,
    };
  }
  // Fremder Error: loggen + re-throwen. Das sind Programmier-Bugs oder
  // unbekannte Runtime-Fehler; der Call-Site soll den Stack-Trace sehen.
  const message = err instanceof Error ? err.message : String(err);
  return {
    status: "failure",
    logMessage: `[unclassified] ${message}`,
    result: { status: "failure", data: null, reason: message },
    persistOnIntegration: false,
    rethrow: true,
  };
}

export async function executeConnectorTool(
  input: ExecuteConnectorToolInput,
  ops: GatewayOps,
): Promise<ToolResult> {
  const startedAt = Date.now();
  const getProvider = ops.getProvider ?? getConnectorProvider;

  // Integration laden — *vor* dem try/finally, weil ohne Integration-
  // Row kein Audit-Anker existiert und der Call eine Config-Exception
  // ist, kein Tool-Fehler.
  const integration = await ops.loadIntegration(
    input.integrationId,
    input.ownerAccountId,
  );
  if (!integration) {
    throw new ConnectorConfigError(
      `Integration "${input.integrationId}" not found for account "${input.ownerAccountId}".`,
    );
  }

  let status: UsageLogStatus = "success";
  let logMessage: string | null = null;
  let toolResult: ToolResult = { status: "success", data: null };
  let rethrowErr: unknown = null;

  try {
    if (!integration.enabled) {
      status = "failure";
      logMessage = "integration-disabled";
      toolResult = {
        status: "failure",
        data: null,
        reason: "Integration is disabled",
      };
      return toolResult;
    }

    const provider = getProvider(integration.connectorType);
    const allScopes = await ops.loadScopes(integration.id);
    // Filter auf scopeIds-Subset, wenn gegeben. Undefined ⇒ alle.
    // Leerer Array ⇒ leere Liste (Tool entscheidet, meist Early-Return).
    const scopes =
      input.scopeIds === undefined
        ? allScopes
        : input.scopeIds.length === 0
          ? []
          : (() => {
              const wanted = new Set(input.scopeIds);
              return allScopes.filter((s) => wanted.has(s.id));
            })();

    const executionContext: ExecutionContext = {
      integration,
      scopes,
      callerUserId: input.callerUserId,
      spaceId: input.spaceId,
      abortSignal: input.abortSignal,
    };
    const reqCtx: RequestContext = {
      toolName: input.toolName,
      args: input.args,
      executionContext,
      requiredScopes: input.requiredScopes,
    };

    try {
      const resCtx = await runPipeline(MVP_PIPELINE, reqCtx, async (ctx) => {
        const r = await provider.executeTool(
          ctx.toolName,
          ctx.args,
          ctx.executionContext,
        );
        return {
          result: r,
          observedScopes: input.extractObservedScopes?.(r) ?? [],
        };
      });
      toolResult = resCtx.result;
      // Der Provider darf im ToolResult selbst schon `degraded` setzen
      // (z.B. partielle Trefferliste nach Timeout). In dem Fall führen
      // wir das durch, statt auf Success zu setzen.
      status =
        toolResult.status === "degraded"
          ? "degraded"
          : toolResult.status === "failure"
            ? "failure"
            : "success";
      if (toolResult.status !== "success" && toolResult.reason) {
        logMessage = toolResult.reason;
      }
    } catch (err) {
      const classified = classifyError(err);
      status = classified.status;
      logMessage = classified.logMessage;
      toolResult = classified.result;

      if (classified.persistOnIntegration) {
        // Swallow: wir blockieren den Response nicht wegen einer
        // Folge-Schreib-Operation, loggen aber in die Konsole für Ops.
        await ops
          .recordIntegrationError(integration.id, classified.logMessage)
          .catch((persistErr) => {
            console.error(
              "[connector-gateway] recordIntegrationError failed:",
              persistErr,
            );
          });
      }

      if (classified.rethrow) {
        rethrowErr = err;
      }
    }

    return toolResult;
  } finally {
    // `recordUsage` läuft immer. Auch der Rethrow-Pfad kommt hier
    // durch — der eigentliche throw passiert erst nach finally.
    const durationMs = Date.now() - startedAt;
    try {
      await ops.recordUsage({
        ownerAccountId: input.ownerAccountId,
        userId: input.callerUserId,
        connectorIntegrationId: integration.id,
        spaceId: input.spaceId,
        action: input.toolName,
        status,
        requestMetadata: {
          args: sanitizeArgs(input.args),
          connectorType: integration.connectorType,
        },
        responseMetadata: logMessage ? { error: logMessage } : null,
        durationMs,
      });
    } catch (logErr) {
      // Log-Schreibfehler dürfen den Tool-Call nie kippen. Nur
      // Konsolen-Log, damit Ops das in Vercel sieht.
      console.error("[connector-gateway] usage-log write failed:", logErr);
    }

    if (rethrowErr) {
      // eslint-disable-next-line no-unsafe-finally -- intentional: rethrow
      throw rethrowErr;
    }
  }
}
