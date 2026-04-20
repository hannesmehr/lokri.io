/**
 * Public Barrel für das Connector-Framework — **DB-frei**.
 *
 * Hier werden nur Module re-exportiert, die keine Datenbank-Abhängigkeit
 * ins Ziel ziehen. Alles mit DB-Touch (CRUD-Helpers, Gateway-Live-
 * Binding, Usage-Log-INSERT) bleibt direkt importierbar über Sub-Pfade:
 *
 *   ```ts
 *   import { getIntegrationForAccount } from "@/lib/connectors/integrations";
 *   import { listScopes } from "@/lib/connectors/scopes";
 *   import { createMapping } from "@/lib/connectors/mappings";
 *   import { recordUsage } from "@/lib/connectors/usage-log";
 *   import { executeConnectorToolLive } from "@/lib/connectors/gateway-live";
 *   ```
 *
 * Der pure Gateway (DI-Form, DB-frei) wird hier re-exportiert, damit
 * Tests und Edge-Runtime-safe Call-Sites ihn ohne DB-Import laden
 * können. Der DB-gebundene `executeConnectorToolLive` lebt bewusst
 * *nicht* im Barrel.
 *
 * Motivation: Der Barrel soll aus einer Edge-Runtime oder in einer
 * Test-Umgebung ohne `DATABASE_URL` importierbar bleiben. Ein einziger
 * Transitiv-Import von `@/lib/db` würde den Export-Graph kippen und
 * jeden Caller zwingen, sich um ENV-Variablen zu kümmern.
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
  decryptConnectorCredentials,
  encryptConnectorCredentials,
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
export { sanitizeArgs } from "./sanitize";
export {
  executeConnectorTool,
  type ExecuteConnectorToolInput,
  type GatewayOps,
} from "./gateway";
