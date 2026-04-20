/**
 * View-Model-Helper für die Connector-Admin-API + UI.
 *
 * - `listIntegrationsWithStats(ownerAccountId)` liefert die Integration-
 *   Liste der Übersichts-Seite: Metadata + Scope-Count + Mapping-Count
 *   pro Row, via SQL-Aggregate in einem Query (statt N+1).
 *
 * - `loadIntegrationDetail(integrationId, ownerAccountId)` liefert das
 *   Complete-Picture für die Detail-Seite: Integration + allowlist-
 *   Scopes + Mappings (gejoint gegen lokri-Spaces, damit die UI den
 *   Space-Namen kennt).
 *
 * **Never return credentials or credentialsEncrypted.** Beide Helper
 * droppen das Feld explizit — API-Responses auf Connector-Routes sind
 * contractlich credentials-frei.
 */

import { and, count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  connectorIntegrations,
  connectorScopeAllowlist,
  spaceExternalSources,
  spaces as spacesTable,
} from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IntegrationSummary {
  id: string;
  connectorType: string;
  displayName: string;
  authType: string;
  enabled: boolean;
  lastTestedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
  scopeCount: number;
  mappingCount: number;
}

export interface IntegrationScopeView {
  id: string;
  scopeType: string;
  scopeIdentifier: string;
  scopeMetadata: Record<string, unknown> | null;
  createdAt: Date;
  /** Wie viele Mappings nutzen diesen Scope aktuell — für UI-Warnung
   *  "wenn Sie diesen Scope entfernen, wird auch Mapping X gelöscht". */
  mappingCount: number;
}

export interface IntegrationMappingView {
  id: string;
  scopeId: string;
  scopeIdentifier: string;
  scopeMetadata: Record<string, unknown> | null;
  spaceId: string;
  spaceName: string;
  createdAt: Date;
  addedByUserId: string | null;
}

export interface IntegrationDetail {
  id: string;
  ownerAccountId: string;
  connectorType: string;
  displayName: string;
  authType: string;
  /** Plain config (kein credentials-Feld). */
  config: Record<string, unknown>;
  enabled: boolean;
  lastTestedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
  scopes: IntegrationScopeView[];
  mappings: IntegrationMappingView[];
}

// ---------------------------------------------------------------------------
// listIntegrationsWithStats
// ---------------------------------------------------------------------------

export async function listIntegrationsWithStats(
  ownerAccountId: string,
): Promise<IntegrationSummary[]> {
  // Erst alle Integrations dieses Teams laden (ohne credentials).
  const integrations = await db
    .select({
      id: connectorIntegrations.id,
      connectorType: connectorIntegrations.connectorType,
      displayName: connectorIntegrations.displayName,
      authType: connectorIntegrations.authType,
      enabled: connectorIntegrations.enabled,
      lastTestedAt: connectorIntegrations.lastTestedAt,
      lastError: connectorIntegrations.lastError,
      createdAt: connectorIntegrations.createdAt,
      updatedAt: connectorIntegrations.updatedAt,
    })
    .from(connectorIntegrations)
    .where(eq(connectorIntegrations.ownerAccountId, ownerAccountId))
    .orderBy(connectorIntegrations.createdAt);

  if (integrations.length === 0) return [];

  // Scope-Counts per Integration. GROUP BY.
  const scopeCounts = await db
    .select({
      integrationId: connectorScopeAllowlist.connectorIntegrationId,
      count: count(),
    })
    .from(connectorScopeAllowlist)
    .where(
      eq(
        connectorScopeAllowlist.connectorIntegrationId,
        // Constrained by the integrations-list via app-layer filter
        connectorScopeAllowlist.connectorIntegrationId,
      ),
    )
    .groupBy(connectorScopeAllowlist.connectorIntegrationId);

  // Mapping-Counts per Integration via Join auf scope-allowlist.
  const mappingCounts = await db
    .select({
      integrationId: connectorScopeAllowlist.connectorIntegrationId,
      count: count(),
    })
    .from(spaceExternalSources)
    .innerJoin(
      connectorScopeAllowlist,
      eq(
        spaceExternalSources.connectorScopeId,
        connectorScopeAllowlist.id,
      ),
    )
    .groupBy(connectorScopeAllowlist.connectorIntegrationId);

  const scopeMap = new Map(scopeCounts.map((r) => [r.integrationId, r.count]));
  const mappingMap = new Map(
    mappingCounts.map((r) => [r.integrationId, r.count]),
  );

  return integrations.map((i) => ({
    ...i,
    scopeCount: scopeMap.get(i.id) ?? 0,
    mappingCount: mappingMap.get(i.id) ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// loadIntegrationDetail
// ---------------------------------------------------------------------------

export async function loadIntegrationDetail(
  integrationId: string,
  ownerAccountId: string,
): Promise<IntegrationDetail | null> {
  // Integration laden — scoped auf Team (verhindert Cross-Team-Access).
  const [integration] = await db
    .select({
      id: connectorIntegrations.id,
      ownerAccountId: connectorIntegrations.ownerAccountId,
      connectorType: connectorIntegrations.connectorType,
      displayName: connectorIntegrations.displayName,
      authType: connectorIntegrations.authType,
      config: connectorIntegrations.config,
      enabled: connectorIntegrations.enabled,
      lastTestedAt: connectorIntegrations.lastTestedAt,
      lastError: connectorIntegrations.lastError,
      createdAt: connectorIntegrations.createdAt,
      updatedAt: connectorIntegrations.updatedAt,
    })
    .from(connectorIntegrations)
    .where(
      and(
        eq(connectorIntegrations.id, integrationId),
        eq(connectorIntegrations.ownerAccountId, ownerAccountId),
      ),
    )
    .limit(1);
  if (!integration) return null;

  // Scopes + Mapping-Counts per Scope (für UI-Warnung).
  const scopesRaw = await db
    .select({
      id: connectorScopeAllowlist.id,
      scopeType: connectorScopeAllowlist.scopeType,
      scopeIdentifier: connectorScopeAllowlist.scopeIdentifier,
      scopeMetadata: connectorScopeAllowlist.scopeMetadata,
      createdAt: connectorScopeAllowlist.createdAt,
    })
    .from(connectorScopeAllowlist)
    .where(
      eq(
        connectorScopeAllowlist.connectorIntegrationId,
        integrationId,
      ),
    )
    .orderBy(connectorScopeAllowlist.scopeIdentifier);

  const mappingCountsPerScope = await db
    .select({
      scopeId: spaceExternalSources.connectorScopeId,
      count: count(),
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
        integrationId,
      ),
    )
    .groupBy(spaceExternalSources.connectorScopeId);
  const perScopeMap = new Map(
    mappingCountsPerScope.map((r) => [r.scopeId, r.count]),
  );
  const scopes: IntegrationScopeView[] = scopesRaw.map((s) => ({
    id: s.id,
    scopeType: s.scopeType,
    scopeIdentifier: s.scopeIdentifier,
    scopeMetadata: (s.scopeMetadata as Record<string, unknown> | null) ?? null,
    createdAt: s.createdAt,
    mappingCount: perScopeMap.get(s.id) ?? 0,
  }));

  // Mappings — join auf scope + space.
  const mappingsRaw = await db
    .select({
      id: spaceExternalSources.id,
      scopeId: connectorScopeAllowlist.id,
      scopeIdentifier: connectorScopeAllowlist.scopeIdentifier,
      scopeMetadata: connectorScopeAllowlist.scopeMetadata,
      spaceId: spacesTable.id,
      spaceName: spacesTable.name,
      createdAt: spaceExternalSources.createdAt,
      addedByUserId: spaceExternalSources.addedByUserId,
    })
    .from(spaceExternalSources)
    .innerJoin(
      connectorScopeAllowlist,
      eq(
        spaceExternalSources.connectorScopeId,
        connectorScopeAllowlist.id,
      ),
    )
    .innerJoin(spacesTable, eq(spacesTable.id, spaceExternalSources.spaceId))
    .where(
      eq(
        connectorScopeAllowlist.connectorIntegrationId,
        integrationId,
      ),
    )
    .orderBy(spacesTable.name);
  const mappings: IntegrationMappingView[] = mappingsRaw.map((m) => ({
    id: m.id,
    scopeId: m.scopeId,
    scopeIdentifier: m.scopeIdentifier,
    scopeMetadata: (m.scopeMetadata as Record<string, unknown> | null) ?? null,
    spaceId: m.spaceId,
    spaceName: m.spaceName,
    createdAt: m.createdAt,
    addedByUserId: m.addedByUserId,
  }));

  return {
    ...integration,
    config: (integration.config as Record<string, unknown>) ?? {},
    scopes,
    mappings,
  };
}
