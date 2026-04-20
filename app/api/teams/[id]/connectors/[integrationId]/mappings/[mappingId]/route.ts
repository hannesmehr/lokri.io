/**
 * `DELETE /api/teams/[id]/connectors/[integrationId]/mappings/[mappingId]`
 *
 * Entfernt ein Space-Mapping. Kein Cascade auf scope_allowlist — die
 * Allowlist bleibt intakt, nur der Space-Link wird gelöst.
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  ApiAuthError,
  authErrorResponse,
  codedApiError,
  serverError,
} from "@/lib/api/errors";
import { logAuditEvent } from "@/lib/audit/log";
import { db } from "@/lib/db";
import {
  connectorScopeAllowlist,
  spaceExternalSources,
} from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { deleteMapping } from "@/lib/connectors/mappings";
import { requireConnectorAdmin } from "@/lib/teams/connectors-api";

export const runtime = "nodejs";
export const maxDuration = 15;

type Params = {
  params: Promise<{
    id: string;
    integrationId: string;
    mappingId: string;
  }>;
};

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id: teamId, integrationId, mappingId } = await params;
    const auth = await requireConnectorAdmin(teamId);
    if (!auth.ok) return auth.error;

    // Ownership-Check: Mapping muss zu einer Scope gehören, die zur
    // Integration gehört, die zum Team gehört. Wir joinen und prüfen.
    const [mapping] = await db
      .select({
        id: spaceExternalSources.id,
        spaceId: spaceExternalSources.spaceId,
        scopeIdentifier: connectorScopeAllowlist.scopeIdentifier,
        integrationId: connectorScopeAllowlist.connectorIntegrationId,
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
        and(
          eq(spaceExternalSources.id, mappingId),
          eq(
            connectorScopeAllowlist.connectorIntegrationId,
            integrationId,
          ),
        ),
      )
      .limit(1);

    if (!mapping) {
      return codedApiError(404, "connector.integration.mappingNotFound");
    }

    await deleteMapping(mappingId);

    await logAuditEvent({
      ownerAccountId: teamId,
      actorUserId: auth.session.user.id,
      action: "team.connector.mapping_removed",
      targetType: "connector-integration",
      targetId: integrationId,
      metadata: {
        mappingId,
        spaceId: mapping.spaceId,
        scopeIdentifier: mapping.scopeIdentifier,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[teams.connectors.mappings.delete]", err);
    return serverError(err);
  }
}
