/**
 * `ConnectorProvider` — die Runtime-Schnittstelle pro Connector-Typ.
 *
 * Eine Provider-Implementation kapselt:
 *   1. Die statische `definition` (was der Typ kann)
 *   2. `testCredentials()` — Setup-Validierung
 *   3. `discoverScopes()` — Upstream fragen "was darf dieses Token sehen?"
 *   4. `executeTool()` — Tool-Calls zum Upstream übersetzen
 *
 * Wichtig: `executeTool()` läuft NICHT pur. Der Gateway (Block 2)
 * wickelt den Call in die Filter-Pipeline (`scopeEnforcementFilter` →
 * `executeTool` → `scopePostFilter`). Die Provider-Implementation
 * kümmert sich nur um den Upstream-Call selbst.
 *
 * Der Provider darf Fehler aus `lib/connectors/errors.ts` werfen:
 *   - `ConnectorAuthError` bei 401/403 vom Upstream
 *   - `ConnectorUpstreamError` bei 5xx, Rate-Limit, Timeout
 *   - `ConnectorScopeError` *ausnahmsweise*, wenn der Provider vor dem
 *     Filter-Check schon weiss, dass ein Scope ungültig ist
 */

import type {
  ConnectorDefinition,
  DiscoveredScope,
  ExecutionContext,
  TestResult,
  ToolResult,
} from "./types";

export interface ConnectorProvider {
  readonly definition: ConnectorDefinition;

  /**
   * Validiert Credentials gegen den Upstream. Wird im Setup-Flow
   * aufgerufen, bevor die Integration persistiert wird, und optional
   * via Admin-UI "Verbindung testen"-Button.
   *
   * `credentials` und `config` sind hier schon entschlüsselt bzw. plain —
   * der Caller (Setup-Handler) macht die Entschlüsselung.
   */
  testCredentials(
    credentials: unknown,
    config: unknown,
  ): Promise<TestResult>;

  /**
   * Fragt den Upstream: "Welche Sub-Ressourcen sind für dieses Token
   * sichtbar?" — z.B. alle Confluence-Spaces, die der PAT-Besitzer
   * sehen kann. Im UI präsentiert, damit der Admin die Whitelist
   * aussucht.
   *
   * Das Ergebnis landet NICHT direkt in der DB — der Setup-Flow nimmt
   * die User-Auswahl und schreibt nur die gewählten Scopes.
   */
  discoverScopes(
    credentials: unknown,
    config: unknown,
  ): Promise<DiscoveredScope[]>;

  /**
   * Führt ein MCP-Tool gegen den Upstream aus. Der Gateway ruft das
   * *zwischen* `scopeEnforcementFilter` und `scopePostFilter` auf —
   * der Pre-Filter hat bereits bestätigt, dass `args` nur auf
   * `context.scopes` zielt.
   *
   * `toolName` muss in `definition.tools` enthalten sein; unbekannte
   * Tools führen zu `ConnectorConfigError`. `args`-Shape ist
   * tool-spezifisch und wird intern vom Provider validiert.
   */
  executeTool(
    toolName: string,
    args: unknown,
    context: ExecutionContext,
  ): Promise<ToolResult>;
}
