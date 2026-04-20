/**
 * `PUT /api/teams/[id]/connectors/[integrationId]/scopes`
 *
 * Replace-all Scope-Allowlist. Atomar via `replaceIntegrationScopes`
 * (delete-all + bulk-insert in einer Tx). Space-Mappings, deren
 * Ziel-Scope wegfällt, werden vom FK-Cascade mit entfernt — die UI
 * warnt den User davor, der Server enforcet den Cascade.
 *
 * Payload: `{ scopes: [{scope_type, scope_identifier, scope_metadata?}] }`.
 * Min 1 Scope (leere Allowlist ergibt nutzlose Integration). Max 500.
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
import { replaceIntegrationScopes } from "@/lib/connectors/scopes";
import { requireConnectorAdmin } from "@/lib/teams/connectors-api";
import { replaceScopesSchema } from "@/lib/teams/connectors-schemas";
import { loadIntegrationDetail } from "@/lib/teams/connectors-views";

export const runtime = "nodejs";
export const maxDuration = 15;

type Params = {
  params: Promise<{ id: string; integrationId: string }>;
};

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { id: teamId, integrationId } = await params;
    const auth = await requireConnectorAdmin(teamId);
    if (!auth.ok) return auth.error;

    const body = await parseJsonBody(req, 64 * 1024);
    const parsed = replaceScopesSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const detail = await loadIntegrationDetail(integrationId, teamId);
    if (!detail) {
      return codedApiError(404, "connector.integration.notFound");
    }

    const previousIdentifiers = new Set(
      detail.scopes.map((s) => s.scopeIdentifier),
    );
    const nextIdentifiers = new Set(
      parsed.data.scopes.map((s) => s.scope_identifier),
    );
    const removed = [...previousIdentifiers].filter(
      (id) => !nextIdentifiers.has(id),
    );
    const added = [...nextIdentifiers].filter(
      (id) => !previousIdentifiers.has(id),
    );

    await replaceIntegrationScopes(
      integrationId,
      parsed.data.scopes.map((s) => ({
        scopeType: s.scope_type,
        scopeIdentifier: s.scope_identifier,
        scopeMetadata: s.scope_metadata ?? null,
      })),
    );

    // Mappings, die zu entfernten Scopes gehörten, wurden per FK-
    // cascade schon gelöscht. Wir loggen den Cascade-Count zur
    // Nachvollziehbarkeit.
    const cascadedMappings = detail.mappings.filter((m) =>
      removed.includes(m.scopeIdentifier),
    );

    await logAuditEvent({
      ownerAccountId: teamId,
      actorUserId: auth.session.user.id,
      action: "team.connector.scopes_replaced",
      targetType: "connector-integration",
      targetId: integrationId,
      metadata: {
        added,
        removed,
        cascadedMappingCount: cascadedMappings.length,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[teams.connectors.scopes.put]", err);
    return serverError(err);
  }
}
