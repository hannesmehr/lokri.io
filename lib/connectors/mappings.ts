/**
 * CRUD für `space_external_sources` — das N:M-Mapping lokri-Space ↔
 * Connector-Scope.
 *
 * MVP-Einschränkung: Die DB erzwingt 1:1 via Partial-Unique-Index auf
 * `connector_scope_id` (ein Scope kann nur in einen Space gemappt sein).
 * Ein Insert, der dagegen verstösst, wirft eine Postgres-
 * Unique-Violation — wir fangen das hier nicht ab, sondern lassen die
 * API-Route / den Gateway-Caller den `23505`-Errorcode in eine
 * freundliche UX-Message übersetzen.
 *
 * Phase 2 dropt den Partial-Index und öffnet n:1-Compositions;
 * Funktions-Signatur hier bleibt gleich.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  connectorIntegrations,
  connectorScopeAllowlist,
  spaceExternalSources,
} from "@/lib/db/schema";
import type {
  ConnectorIntegration,
  ConnectorScope,
  SpaceExternalSource,
} from "./types";

export interface CreateMappingInput {
  spaceId: string;
  connectorScopeId: string;
  addedByUserId: string;
}

export async function createMapping(
  input: CreateMappingInput,
): Promise<SpaceExternalSource> {
  const [row] = await db
    .insert(spaceExternalSources)
    .values({
      spaceId: input.spaceId,
      connectorScopeId: input.connectorScopeId,
      addedByUserId: input.addedByUserId,
    })
    .returning();
  return row;
}

export async function deleteMapping(id: string): Promise<void> {
  await db
    .delete(spaceExternalSources)
    .where(eq(spaceExternalSources.id, id));
}

export async function deleteMappingByRef(
  spaceId: string,
  connectorScopeId: string,
): Promise<void> {
  await db
    .delete(spaceExternalSources)
    .where(
      and(
        eq(spaceExternalSources.spaceId, spaceId),
        eq(spaceExternalSources.connectorScopeId, connectorScopeId),
      ),
    );
}

/** Alle externen Quellen, die auf diesen lokri-Space gemappt sind.
 *  Join auf `connector_scope_allowlist`, weil der Caller üblicherweise
 *  `scope_type + scope_identifier` für die Provider-Query braucht. */
export async function listSpaceExternalSources(
  spaceId: string,
): Promise<
  Array<{
    mapping: SpaceExternalSource;
    scope: ConnectorScope;
  }>
> {
  const rows = await db
    .select({
      mapping: spaceExternalSources,
      scope: connectorScopeAllowlist,
    })
    .from(spaceExternalSources)
    .innerJoin(
      connectorScopeAllowlist,
      eq(
        spaceExternalSources.connectorScopeId,
        connectorScopeAllowlist.id,
      ),
    )
    .where(eq(spaceExternalSources.spaceId, spaceId));
  return rows;
}

/**
 * Bulk-Variante für Unified-Search: alle External-Sources für eine
 * Liste von lokri-Space-IDs, mit vollem Join auf Scope + Integration.
 *
 * Returnt pro Mapping-Row den kompletten Kontext, den der Search-
 * Federation-Code braucht: welcher Mapping-Scope wurde auf welchen
 * lokri-Space gemappt, zu welcher Integration gehört der, welcher
 * Connector-Typ ist das.
 *
 * Integrations mit `enabled = false` werden ausgefiltert — deaktivierte
 * Integrationen sollen nicht mitfedieren.
 *
 * Gibt leeres Array zurück, wenn `spaceIds` leer ist (statt Query mit
 * `IN ()`-Syntax-Fehler).
 */
export async function listExternalSourcesForSpaces(
  spaceIds: string[],
): Promise<
  Array<{
    mapping: SpaceExternalSource;
    scope: ConnectorScope;
    integration: ConnectorIntegration;
  }>
> {
  if (spaceIds.length === 0) return [];
  return db
    .select({
      mapping: spaceExternalSources,
      scope: connectorScopeAllowlist,
      integration: connectorIntegrations,
    })
    .from(spaceExternalSources)
    .innerJoin(
      connectorScopeAllowlist,
      eq(
        spaceExternalSources.connectorScopeId,
        connectorScopeAllowlist.id,
      ),
    )
    .innerJoin(
      connectorIntegrations,
      eq(
        connectorScopeAllowlist.connectorIntegrationId,
        connectorIntegrations.id,
      ),
    )
    .where(
      and(
        inArray(spaceExternalSources.spaceId, spaceIds),
        eq(connectorIntegrations.enabled, true),
      ),
    );
}

/** Alle Spaces, die einen Scope dieser Integration nutzen — umgekehrte
 *  Richtung für Admin-UI („welche Spaces hängen an dieser Integration"). */
export async function listIntegrationUsages(
  connectorIntegrationId: string,
): Promise<
  Array<{
    mapping: SpaceExternalSource;
    scope: ConnectorScope;
  }>
> {
  const rows = await db
    .select({
      mapping: spaceExternalSources,
      scope: connectorScopeAllowlist,
    })
    .from(spaceExternalSources)
    .innerJoin(
      connectorScopeAllowlist,
      eq(
        spaceExternalSources.connectorScopeId,
        connectorScopeAllowlist.id,
      ),
    )
    .where(
      eq(
        connectorScopeAllowlist.connectorIntegrationId,
        connectorIntegrationId,
      ),
    );
  return rows;
}
