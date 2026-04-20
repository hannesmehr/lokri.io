/**
 * `/api/teams/[id]/connectors/[integrationId]` — Detail/Patch/Delete.
 *
 * GET: Team-Members dürfen lesen; credentials werden nie geliefert.
 *      Enthält Integration-Metadata + Scopes + Mappings + per-scope
 *      mapping-count (fürs UI-Warning „wenn Sie diesen Scope
 *      entfernen…").
 *
 * PATCH: Owner-only. Partial update auf `display_name` und/oder
 *        `enabled`. Keine Credentials via PATCH — dafür ist
 *        `PUT /credentials`.
 *
 * DELETE: Owner-only. Cascade löscht scopes + mappings (via FK).
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  ApiAuthError,
  authErrorResponse,
  codedApiError,
  notFound,
  parseJsonBody,
  serverError,
  zodError,
} from "@/lib/api/errors";
import { logAuditEvent } from "@/lib/audit/log";
import {
  deleteIntegration,
  updateIntegration,
} from "@/lib/connectors/integrations";
import { requireConnectorAdmin } from "@/lib/teams/connectors-api";
import { patchIntegrationSchema } from "@/lib/teams/connectors-schemas";
import { loadIntegrationDetail } from "@/lib/teams/connectors-views";

export const runtime = "nodejs";
export const maxDuration = 15;

type Params = {
  params: Promise<{ id: string; integrationId: string }>;
};

// ---------------------------------------------------------------------------
// GET — Detail (Members können lesen)
// ---------------------------------------------------------------------------

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id: teamId, integrationId } = await params;
    const auth = await requireConnectorAdmin(teamId, { readOnly: true });
    if (!auth.ok) return auth.error;

    const detail = await loadIntegrationDetail(integrationId, teamId);
    if (!detail) {
      return codedApiError(404, "connector.integration.notFound");
    }

    return NextResponse.json({
      integration: {
        id: detail.id,
        connector_type: detail.connectorType,
        display_name: detail.displayName,
        auth_type: detail.authType,
        // `config` ist plain-JSON (siteUrl etc.) — keine credentials.
        config: detail.config,
        enabled: detail.enabled,
        last_tested_at: detail.lastTestedAt?.toISOString() ?? null,
        last_error: detail.lastError,
        created_at: detail.createdAt.toISOString(),
        updated_at: detail.updatedAt.toISOString(),
      },
      scopes: detail.scopes.map((s) => ({
        id: s.id,
        scope_type: s.scopeType,
        scope_identifier: s.scopeIdentifier,
        scope_metadata: s.scopeMetadata,
        mapping_count: s.mappingCount,
        created_at: s.createdAt.toISOString(),
      })),
      mappings: detail.mappings.map((m) => ({
        id: m.id,
        scope_id: m.scopeId,
        scope_identifier: m.scopeIdentifier,
        scope_metadata: m.scopeMetadata,
        space_id: m.spaceId,
        space_name: m.spaceName,
        added_by_user_id: m.addedByUserId,
        created_at: m.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[teams.connectors.detail.get]", err);
    return serverError(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH — display_name + enabled
// ---------------------------------------------------------------------------

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id: teamId, integrationId } = await params;
    const auth = await requireConnectorAdmin(teamId);
    if (!auth.ok) return auth.error;

    const body = await parseJsonBody(req, 2 * 1024);
    const parsed = patchIntegrationSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);
    const input = parsed.data;

    // Existence-Check: Integration muss dem Team gehören.
    const detail = await loadIntegrationDetail(integrationId, teamId);
    if (!detail) {
      return codedApiError(404, "connector.integration.notFound");
    }

    const updated = await updateIntegration(integrationId, {
      displayName: input.display_name,
      enabled: input.enabled,
    });
    if (!updated) {
      return notFound("Integration not found");
    }

    await logAuditEvent({
      ownerAccountId: teamId,
      actorUserId: auth.session.user.id,
      action: "team.connector.updated",
      targetType: "connector-integration",
      targetId: integrationId,
      metadata: {
        changedFields: Object.keys(input),
        previousDisplayName:
          input.display_name !== undefined ? detail.displayName : undefined,
        previousEnabled:
          input.enabled !== undefined ? detail.enabled : undefined,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[teams.connectors.detail.patch]", err);
    return serverError(err);
  }
}

// ---------------------------------------------------------------------------
// DELETE — löschen (cascade auf scopes + mappings)
// ---------------------------------------------------------------------------

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id: teamId, integrationId } = await params;
    const auth = await requireConnectorAdmin(teamId);
    if (!auth.ok) return auth.error;

    const detail = await loadIntegrationDetail(integrationId, teamId);
    if (!detail) {
      return codedApiError(404, "connector.integration.notFound");
    }

    await deleteIntegration(integrationId);

    await logAuditEvent({
      ownerAccountId: teamId,
      actorUserId: auth.session.user.id,
      action: "team.connector.deleted",
      targetType: "connector-integration",
      targetId: integrationId,
      metadata: {
        connectorType: detail.connectorType,
        displayName: detail.displayName,
        scopeCount: detail.scopes.length,
        mappingCount: detail.mappings.length,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[teams.connectors.detail.delete]", err);
    return serverError(err);
  }
}
