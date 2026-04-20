/**
 * `/api/teams/[id]/connectors` — Listing + atomares Anlegen.
 *
 * GET: Read-only für Team-Mitglieder. Liefert Integrationen mit
 *      Scope-/Mapping-Counts. **Nie Credentials**.
 *
 * POST: Atomar — Integration + Scope-Allowlist + optionale Space-
 *       Mappings in einer Transaction. Führt davor `testCredentials`
 *       aus; fail ⇒ 400 ohne DB-Touch. `discoverScopes` läuft NICHT
 *       hier — der Client hat die Scope-Liste bereits vom
 *       `/validate`-Endpoint bekommen und schickt nur die Auswahl.
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  ApiAuthError,
  authErrorResponse,
  codedApiError,
  parseJsonBody,
  serverError,
  zodError,
} from "@/lib/api/errors";
import { logAuditEvent } from "@/lib/audit/log";
import { db } from "@/lib/db";
import { spaces as spacesTable } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import {
  createIntegration,
  deleteIntegration,
} from "@/lib/connectors/integrations";
import { findScopeByRef, replaceIntegrationScopes } from "@/lib/connectors/scopes";
import { createMapping } from "@/lib/connectors/mappings";
import { ConfluenceCloudProvider } from "@/lib/connectors/providers/confluence-cloud/provider";
import {
  createIntegrationSchema,
} from "@/lib/teams/connectors-schemas";
import {
  requireConnectorAdmin,
} from "@/lib/teams/connectors-api";
import {
  listIntegrationsWithStats,
} from "@/lib/teams/connectors-views";

export const runtime = "nodejs";
export const maxDuration = 30;

type Params = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// GET — Team-Mitglieder können die Liste sehen (read-only)
// ---------------------------------------------------------------------------

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id: teamId } = await params;
    const auth = await requireConnectorAdmin(teamId, { readOnly: true });
    if (!auth.ok) return auth.error;

    const rows = await listIntegrationsWithStats(teamId);
    return NextResponse.json({
      integrations: rows.map((r) => ({
        id: r.id,
        connector_type: r.connectorType,
        display_name: r.displayName,
        auth_type: r.authType,
        enabled: r.enabled,
        last_tested_at: r.lastTestedAt?.toISOString() ?? null,
        last_error: r.lastError,
        scope_count: r.scopeCount,
        mapping_count: r.mappingCount,
        created_at: r.createdAt.toISOString(),
        updated_at: r.updatedAt.toISOString(),
      })),
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[teams.connectors.get]", err);
    return serverError(err);
  }
}

// ---------------------------------------------------------------------------
// POST — atomar anlegen
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id: teamId } = await params;
    const auth = await requireConnectorAdmin(teamId);
    if (!auth.ok) return auth.error;

    const body = await parseJsonBody(req, 32 * 1024);
    const parsed = createIntegrationSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);
    const input = parsed.data;

    // Validate: mapping.scope_identifier muss in scopes[] existieren
    const scopeIdentifierSet = new Set(
      input.scopes.map((s) => s.scope_identifier),
    );
    for (const m of input.mappings) {
      if (!scopeIdentifierSet.has(m.scope_identifier)) {
        return codedApiError(400, "connector.integration.mappingScopeUnknown");
      }
    }

    // Validate: mapping.space_id muss zum Team gehören
    if (input.mappings.length > 0) {
      const mappingSpaceIds = [
        ...new Set(input.mappings.map((m) => m.space_id)),
      ];
      const ownedSpaces = await db
        .select({ id: spacesTable.id })
        .from(spacesTable)
        .where(
          and(
            eq(spacesTable.ownerAccountId, teamId),
            inArray(spacesTable.id, mappingSpaceIds),
          ),
        );
      if (ownedSpaces.length !== mappingSpaceIds.length) {
        return codedApiError(
          400,
          "connector.integration.mappingSpaceNotInTeam",
        );
      }
    }

    // Per-connector_type dispatch. Aktuell nur Confluence Cloud.
    if (input.connector_type !== "confluence-cloud") {
      return codedApiError(400, "connector.integration.unsupportedType");
    }

    // Pre-Persist-Test gegen Upstream. Bei fail: 400, kein DB-Touch.
    const provider = new ConfluenceCloudProvider({ timeoutMs: 10_000 });
    const testResult = await provider.testCredentials(
      input.credentials,
      input.config,
    );
    if (!testResult.ok) {
      return codedApiError(400, "connector.integration.credentialsRejected", {
        message: testResult.message,
      });
    }

    // Atomares Persist: integration → scopes → mappings.
    // Gateway hat keine Transaction-Abstraktion über `integrations.ts`
    // hinweg — wir nutzen die einzelnen Helpers und cleanen bei Fehler
    // manuell, weil `createIntegration` selbst nicht transaktional ist
    // und `replaceIntegrationScopes` in einer eigenen Tx läuft.
    const integration = await createIntegration({
      ownerAccountId: teamId,
      connectorType: input.connector_type,
      displayName: input.display_name,
      authType: "pat",
      credentials: input.credentials,
      config: input.config,
    });

    try {
      // 1. Scopes schreiben — replaceIntegrationScopes ist atomar in
      //    einer Tx (delete-all + bulk-insert).
      await replaceIntegrationScopes(
        integration.id,
        input.scopes.map((s) => ({
          scopeType: s.scope_type,
          scopeIdentifier: s.scope_identifier,
          scopeMetadata: s.scope_metadata ?? null,
        })),
      );

      // 2. Mappings — pro Mapping den Scope per Identifier resolven
      //    und Row anlegen. INSERT…ON CONFLICT DO NOTHING: idempotent
      //    falls der User in einem Setup-Retry dieselben Mappings
      //    schickt.
      for (const m of input.mappings) {
        const scope = await findScopeByRef(
          integration.id,
          "confluence-space",
          m.scope_identifier,
        );
        if (!scope) {
          // Defensiv — sollte nicht passieren weil wir oben validiert
          // haben.
          throw new Error(
            `Scope ${m.scope_identifier} not found after insert`,
          );
        }
        await createMapping({
          spaceId: m.space_id,
          connectorScopeId: scope.id,
          addedByUserId: auth.session.user.id,
        });
      }
    } catch (err) {
      // Cleanup: wenn scopes/mappings fehlschlagen, löschen wir die
      // gerade erstellte Integration. Cascade räumt Scopes +
      // Mappings mit auf.
      await deleteIntegration(integration.id).catch((cleanupErr) => {
        console.error(
          "[teams.connectors.post] cleanup failed for",
          integration.id,
          cleanupErr,
        );
      });
      throw err;
    }

    await logAuditEvent({
      ownerAccountId: teamId,
      actorUserId: auth.session.user.id,
      action: "team.connector.created",
      targetType: "connector-integration",
      targetId: integration.id,
      metadata: {
        connectorType: input.connector_type,
        displayName: input.display_name,
        scopeCount: input.scopes.length,
        mappingCount: input.mappings.length,
      },
    });

    return NextResponse.json(
      {
        id: integration.id,
        connector_type: integration.connectorType,
        display_name: integration.displayName,
        auth_type: integration.authType,
        enabled: integration.enabled,
        scope_count: input.scopes.length,
        mapping_count: input.mappings.length,
        created_at: integration.createdAt.toISOString(),
        updated_at: integration.updatedAt.toISOString(),
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[teams.connectors.post]", err);
    return serverError(err);
  }
}
