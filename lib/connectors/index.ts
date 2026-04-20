/**
 * Public Re-Exports für das Connector-Framework.
 *
 * Block-1-Scope: Kern-Typen, Provider-Interface, Registry, Filter-
 * Pipeline, CRUD-Helper, Encryption, Errors. Kein Gateway, kein
 * konkreter Connector (Confluence, Slack, …) — das kommt mit Block 2
 * und späteren Bausteinen.
 *
 * Call-Sites sollten von `@/lib/connectors` importieren, nicht von
 * den Unterpfaden. Das hält uns die Freiheit, interne Dateien
 * umzubenennen/umzuorganisieren.
 */

export * from "./errors";
export type {
  ConnectorAuthType,
  ConnectorCategory,
  ConnectorDefinition,
  ConnectorIntegration,
  ConnectorScope,
  DiscoveredScope,
  ExecutionContext,
  SpaceExternalSource,
  TestResult,
  ToolResult,
} from "./types";
export type { ConnectorProvider } from "./provider";
export {
  __resetForTests,
  get as getConnectorProvider,
  has as hasConnectorProvider,
  list as listConnectorProviders,
  register as registerConnectorProvider,
} from "./registry";
export {
  encryptConnectorCredentials,
  decryptConnectorCredentials,
} from "./encryption";
export {
  MVP_PIPELINE,
  runPipeline,
  scopeEnforcementFilter,
  scopePostFilter,
} from "./filters";
export type {
  ConnectorFilter,
  InnerExecution,
  RequestContext,
  ResponseContext,
  ScopeRef,
} from "./filters";

// CRUD namespaces — grouped re-exports so call-sites don't have to know
// which file each function lives in.
export * as Integrations from "./integrations";
export * as Scopes from "./scopes";
export * as Mappings from "./mappings";
export * as UsageLog from "./usage-log";
