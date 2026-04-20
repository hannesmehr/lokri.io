/**
 * CRUD für `connector_scope_allowlist`.
 *
 * Der Setup-Flow funktioniert so:
 *   1. Admin legt Integration an (`createIntegration`)
 *   2. UI ruft Provider.discoverScopes() auf und listet mögliche Scopes
 *   3. Admin hakt die zugelassenen Scopes an
 *   4. Frontend schickt die final-Auswahl — Backend ruft
 *      `replaceIntegrationScopes()` auf und ersetzt die Allowlist atomar.
 *
 * Die Replace-Semantik (statt Add-Only) ist wichtig: wenn der Admin
 * einen Scope wieder entfernt, muss er auch wirklich weg sein —
 * inklusive aller gemappten `space_external_sources` (ON DELETE CASCADE
 * erledigt das). Das ist die einzige Stelle, an der Scopes "revoked"
 * werden; eine separate `deleteScope()`-Fn wäre redundant.
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { connectorScopeAllowlist } from "@/lib/db/schema";
import type { ConnectorScope } from "./types";

export interface ScopeInput {
  scopeType: string;
  scopeIdentifier: string;
  scopeMetadata?: Record<string, unknown> | null;
}

export async function listScopes(
  connectorIntegrationId: string,
): Promise<ConnectorScope[]> {
  return db
    .select()
    .from(connectorScopeAllowlist)
    .where(
      eq(connectorScopeAllowlist.connectorIntegrationId, connectorIntegrationId),
    )
    .orderBy(
      connectorScopeAllowlist.scopeType,
      connectorScopeAllowlist.scopeIdentifier,
    );
}

export async function getScope(
  id: string,
): Promise<ConnectorScope | null> {
  const [row] = await db
    .select()
    .from(connectorScopeAllowlist)
    .where(eq(connectorScopeAllowlist.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * Ersetzt die komplette Allowlist einer Integration atomar.
 *
 * Implementation: Transaction mit Delete-all + Bulk-Insert. Nicht
 * „Diff berechnen und gezielt einfügen/löschen", weil:
 *   - Einfacher zu reasoning (kein partielles State-Drift bei Fehler)
 *   - Bei wenigen Scopes (typisch: < 50) ist der Overhead egal
 *   - `space_external_sources` cascaded mit, d.h. Mappings zu
 *     entfernten Scopes werden automatisch mitgelöscht
 *
 * Die aufrufende API-Route sollte dem User einen "diese Mappings gehen
 * verloren"-Confirm anzeigen, bevor sie hier landet.
 */
export async function replaceIntegrationScopes(
  connectorIntegrationId: string,
  scopes: ScopeInput[],
): Promise<ConnectorScope[]> {
  return db.transaction(async (tx) => {
    await tx
      .delete(connectorScopeAllowlist)
      .where(
        eq(
          connectorScopeAllowlist.connectorIntegrationId,
          connectorIntegrationId,
        ),
      );

    if (scopes.length === 0) {
      return [];
    }

    return tx
      .insert(connectorScopeAllowlist)
      .values(
        scopes.map((s) => ({
          connectorIntegrationId,
          scopeType: s.scopeType,
          scopeIdentifier: s.scopeIdentifier,
          scopeMetadata: s.scopeMetadata ?? null,
        })),
      )
      .returning();
  });
}

/**
 * Nachschlagen eines Scope-Eintrags per (Integration, Type, Identifier).
 * Gateway nutzt das, um aus einem `ScopeRef` den DB-Row zu holen (z.B.
 * um eine FK-Referenz in `space_external_sources` zu legen).
 */
export async function findScopeByRef(
  connectorIntegrationId: string,
  scopeType: string,
  scopeIdentifier: string,
): Promise<ConnectorScope | null> {
  const [row] = await db
    .select()
    .from(connectorScopeAllowlist)
    .where(
      and(
        eq(
          connectorScopeAllowlist.connectorIntegrationId,
          connectorIntegrationId,
        ),
        eq(connectorScopeAllowlist.scopeType, scopeType),
        eq(connectorScopeAllowlist.scopeIdentifier, scopeIdentifier),
      ),
    )
    .limit(1);
  return row ?? null;
}
