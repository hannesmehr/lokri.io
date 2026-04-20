/**
 * Produktive Bindung des Gateways an die echten DB-Helper.
 *
 * Im Gegensatz zu `gateway.ts` (DB-frei, DI-basiert) zieht dieses Modul
 * `lib/db` rein. Call-Sites in App-Code importieren aus hier, Tests
 * importieren aus `./gateway` und mocken `GatewayOps`.
 *
 * Edge-Runtime-Hinweis: dieses Modul ist NICHT edge-safe, weil es den
 * Neon-Client transitiv lädt. Pro API-Route entscheiden, was gebraucht
 * wird.
 */

import {
  executeConnectorTool,
  type ExecuteConnectorToolInput,
  type GatewayOps,
} from "./gateway";
import {
  getIntegrationForAccount,
  recordIntegrationError,
} from "./integrations";
import { listScopes } from "./scopes";
import type { ToolResult } from "./types";
import { recordUsage } from "./usage-log";

export const liveGatewayOps: GatewayOps = {
  loadIntegration: getIntegrationForAccount,
  loadScopes: listScopes,
  recordUsage,
  recordIntegrationError,
};

export function executeConnectorToolLive(
  input: ExecuteConnectorToolInput,
): Promise<ToolResult> {
  return executeConnectorTool(input, liveGatewayOps);
}
