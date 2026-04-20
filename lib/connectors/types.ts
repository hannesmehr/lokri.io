/**
 * Connector-Framework Kern-Typen.
 *
 * Terminologie siehe `docs/CONNECTOR_FRAMEWORK.md` §Domain-Modell.
 * Kurz: `ConnectorDefinition` ist statisch (Code), `ConnectorIntegration`
 * ist die DB-Row, `ConnectorScope` ein Eintrag in der Allowlist.
 */

import type { InferSelectModel } from "drizzle-orm";
import type {
  connectorIntegrations,
  connectorScopeAllowlist,
  spaceExternalSources,
} from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Statische Connector-Definition (Code, nicht DB)
// ---------------------------------------------------------------------------

export type ConnectorCategory =
  | "knowledge"
  | "code"
  | "messaging"
  | "files"
  | "automation";

export type ConnectorAuthType = "pat" | "oauth2";

/**
 * Beschreibt einen Connector-Typ statisch — wie er im UI auftaucht,
 * welche Auth-Methode er nutzt, welche Scope-Granularität er anbietet
 * und welche MCP-Tools er exponiert.
 *
 * Eine Instanz liegt als Import-Konstante im Code; neue Typen brauchen
 * einen Deploy, keine Migration (siehe Prinzip 3 im Design-Doc).
 */
export interface ConnectorDefinition {
  /** Stabiler Slug — z.B. `"confluence-cloud"`. Muss in der Registry
   *  unique sein und matched `connector_integrations.connector_type`. */
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Icon-Referenz — im MVP ein lucide-Icon-Name, später evtl. SVG-Import. */
  readonly icon: string;
  readonly category: ConnectorCategory;
  readonly authType: ConnectorAuthType;
  readonly scopeModel: {
    /** Matched `connector_scope_allowlist.scope_type`. */
    type: string;
    /** UI-Label für die Scope-Liste — z.B. `"Confluence-Spaces"`. */
    label: string;
    /** UI-Label für den Identifier — z.B. `"Space-Key"`. */
    identifierLabel: string;
  };
  /** Tool-Slugs, die der Provider unter `executeTool` versteht. */
  readonly tools: readonly string[];
}

// ---------------------------------------------------------------------------
// DB-Row-Typen (inferred)
// ---------------------------------------------------------------------------

/**
 * DB-Row einer konfigurierten Integration. `credentialsEncrypted` ist
 * der Rohwert aus der DB — Consumer rufen `decryptConnectorCredentials()`
 * aus `lib/connectors/encryption.ts` auf, um das Klartext-Objekt zu
 * bekommen. Verhindert, dass Klartext-Credentials versehentlich durchs
 * Logging oder ins ExecutionContext leaken.
 */
export type ConnectorIntegration = InferSelectModel<typeof connectorIntegrations>;

export type ConnectorScope = InferSelectModel<typeof connectorScopeAllowlist>;

export type SpaceExternalSource = InferSelectModel<typeof spaceExternalSources>;

// ---------------------------------------------------------------------------
// Provider-Rückgabe-Typen
// ---------------------------------------------------------------------------

/** Resultat von `testCredentials()`. */
export interface TestResult {
  ok: boolean;
  /** Frei-Text für UI — z.B. `"Eingeloggt als jane@empro.ch"` bei `ok: true`
   *  oder die Fehlerursache bei `ok: false`. */
  message: string;
  /** Optional: connector-spezifische Diagnostik-Felder (z.B. API-Version). */
  diagnostics?: Record<string, unknown>;
}

/** Ein vom Upstream gefundener potentieller Scope — z.B. ein
 *  Confluence-Space, der dem PAT sichtbar ist. Wird im Setup-Flow vom
 *  User ausgewählt und in `connector_scope_allowlist` gespeichert. */
export interface DiscoveredScope {
  type: string;
  identifier: string;
  /** Optional: Display-Name, Icon-URL, … — wandert nach `scope_metadata`. */
  metadata?: Record<string, unknown>;
}

/** Erfolgs- oder Degradations-Resultat eines Tool-Calls.
 *
 *  Wir modellieren kein durchgängiges Success-Schema, weil die Tool-Outputs
 *  per-Connector variieren (search hat hits, read-page hat body, etc.).
 *  Der Gateway (Block 2) übersetzt das in ein einheitliches MCP-Result.
 */
export interface ToolResult {
  status: "success" | "degraded" | "failure";
  /** Tool-spezifisches Payload (hits, page-body, …). */
  data: unknown;
  /** Bei `status !== "success"`: menschenlesbare Ursache. */
  reason?: string;
  /** Optional: Metadaten für Logs (durchlaufene Scopes, Timing, …). */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Execution-Context
// ---------------------------------------------------------------------------

/**
 * Kontext, den der Gateway an den Provider weiterreicht.
 *
 * Wichtig: `integration.credentialsEncrypted` ist hier noch verschlüsselt.
 * Der Provider ruft `decryptConnectorCredentials()` selbst auf — so bleibt
 * die Klartext-Lebensdauer minimal (stack-lokal im Provider-Call).
 */
export interface ExecutionContext {
  integration: ConnectorIntegration;
  /** Effektive Scope-Allowlist — pro Tool-Call gefiltert über das
   *  `scopeIds`-Input am Gateway. Bei space-mapping-Tools enthält
   *  das nur die Scopes, die zum Request-lokri-Space gemappt sind;
   *  bei unscoped Calls (z.B. OAuth-Tokens ohne spaceScope) alle
   *  Scopes der Integration. */
  scopes: ConnectorScope[];
  /** Der User, der den MCP-Request ausgelöst hat. Für Audit-Log.
   *  Null bei Legacy-Tokens ohne `created_by_user_id` (Pre-0014
   *  Migrations-Bestand). */
  callerUserId: string | null;
  /** Der lokri-Space, in dessen Kontext der Call läuft. Null für
   *  Tools ohne konkreten Space-Kontext (MCP-Client fragt eine
   *  External-Ressource ohne lokri-Space-Attribution). */
  spaceId: string | null;
  /**
   * Externer Abort-Signal, den der Federation-Layer (Unified-Search)
   * pro Tool-Call aufspannt, um einen 5s-Timeout hart durchzusetzen.
   * Provider reichen das an ihren HTTP-Client weiter; dort wird es
   * mit dem internen Client-Timeout kombiniert.
   *
   * Null/undefined = kein externer Timeout, nur internes Client-Limit
   * greift (z.B. Setup-Flows wie testCredentials/discoverScopes, die
   * nicht über den Gateway laufen).
   */
  abortSignal?: AbortSignal;
}
