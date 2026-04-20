/**
 * INSERT-Helper für `connector_usage_log`.
 *
 * Block-Scope-Hinweis: Der eigentliche Orchestration-Call (wer ruft
 * das wann auf) lebt im Gateway (`executeConnectorTool`, Block 2) —
 * **nicht** als Filter in der Pipeline. Grund: ein Filter sieht
 * Fehler-Pfade nur teilweise (Pre-Filter-Throw überspringt den Post-
 * Filter); der Gateway wraps die Pipeline in ein try/catch/finally und
 * kann auch Failures sauber loggen.
 *
 * Die Funktion hier ist absichtlich fire-and-forget-kompatibel: wir
 * swallowen Fehler nicht, aber der Caller darf den Insert in ein
 * `.catch(console.error)` wrappen, falls er den MCP-Response nicht
 * blocken will. MVP-Entscheidung kommt im Gateway-Block.
 */

import { db } from "@/lib/db";
import { connectorUsageLog } from "@/lib/db/schema";

export type UsageLogStatus = "success" | "failure" | "degraded";

export interface RecordUsageInput {
  ownerAccountId: string;
  userId: string | null;
  connectorIntegrationId: string | null;
  spaceId: string | null;
  /** Slug wie `"search"`, `"read-page"`, … — matched
   *  `ConnectorDefinition.tools`. */
  action: string;
  status: UsageLogStatus;
  /** Sanitized Args-Snapshot (keine Secrets). Der Sanitize-Schritt
   *  lebt im Gateway (Block 2). */
  requestMetadata?: Record<string, unknown> | null;
  /** z.B. `{ hits: 12, degradation_reason: "upstream-5s-timeout" }`. */
  responseMetadata?: Record<string, unknown> | null;
  durationMs?: number | null;
  tokensUsed?: number;
}

export async function recordUsage(input: RecordUsageInput): Promise<void> {
  await db.insert(connectorUsageLog).values({
    ownerAccountId: input.ownerAccountId,
    userId: input.userId,
    connectorIntegrationId: input.connectorIntegrationId,
    spaceId: input.spaceId,
    action: input.action,
    status: input.status,
    requestMetadata: input.requestMetadata ?? null,
    responseMetadata: input.responseMetadata ?? null,
    durationMs: input.durationMs ?? null,
    tokensUsed: input.tokensUsed ?? 0,
  });
}
