/**
 * `POST /api/teams/[id]/connectors/[integrationId]/mappings`
 *
 * Fügt ein Space-Mapping zu dieser Integration hinzu.
 *
 * Constraints:
 *   - `space_id` muss ein Space des Teams sein (sonst 400)
 *   - `scope_identifier` muss in der Allowlist der Integration sein
 *     (sonst 400)
 *   - Kombination (space, scope) muss neu sein — unique-Index wirft
 *     23505; wir mappen auf 409
 *   - MVP-Constraint: ein Scope darf nur in EINEN Space gemappt sein
 *     (Partial-Unique-Index); Duplikat gibt ebenfalls 409
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
import { and, eq } from "drizzle-orm";
import { findScopeByRef } from "@/lib/connectors/scopes";
import { createMapping } from "@/lib/connectors/mappings";
import { requireConnectorAdmin } from "@/lib/teams/connectors-api";
import { addMappingSchema } from "@/lib/teams/connectors-schemas";
import { loadIntegrationDetail } from "@/lib/teams/connectors-views";

export const runtime = "nodejs";
export const maxDuration = 15;

type Params = {
  params: Promise<{ id: string; integrationId: string }>;
};

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id: teamId, integrationId } = await params;
    const auth = await requireConnectorAdmin(teamId);
    if (!auth.ok) return auth.error;

    const body = await parseJsonBody(req, 2 * 1024);
    const parsed = addMappingSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);
    const input = parsed.data;

    // Integration muss dem Team gehören.
    const detail = await loadIntegrationDetail(integrationId, teamId);
    if (!detail) {
      return codedApiError(404, "connector.integration.notFound");
    }

    // Space muss dem Team gehören.
    const [space] = await db
      .select({ id: spacesTable.id })
      .from(spacesTable)
      .where(
        and(
          eq(spacesTable.id, input.space_id),
          eq(spacesTable.ownerAccountId, teamId),
        ),
      )
      .limit(1);
    if (!space) {
      return codedApiError(
        400,
        "connector.integration.mappingSpaceNotInTeam",
      );
    }

    // Scope muss in der Allowlist der Integration sein.
    const scope = await findScopeByRef(
      integrationId,
      "confluence-space",
      input.scope_identifier,
    );
    if (!scope) {
      return codedApiError(
        400,
        "connector.integration.mappingScopeUnknown",
      );
    }

    // Insert — Unique-Violations werden zu 409.
    try {
      const mapping = await createMapping({
        spaceId: input.space_id,
        connectorScopeId: scope.id,
        addedByUserId: auth.session.user.id,
      });

      await logAuditEvent({
        ownerAccountId: teamId,
        actorUserId: auth.session.user.id,
        action: "team.connector.mapping_added",
        targetType: "connector-integration",
        targetId: integrationId,
        metadata: {
          mappingId: mapping.id,
          spaceId: input.space_id,
          scopeIdentifier: input.scope_identifier,
        },
      });

      return NextResponse.json({
        mapping: {
          id: mapping.id,
          space_id: mapping.spaceId,
          scope_id: mapping.connectorScopeId,
          created_at: mapping.createdAt.toISOString(),
        },
      }, { status: 201 });
    } catch (err) {
      // Postgres 23505 = unique_violation. Kommt aus
      //   (space_id, connector_scope_id)-Unique — Duplikat-Mapping
      //   oder (connector_scope_id)-Partial-Unique — Scope bereits
      //   auf anderen Space gemappt.
      const pgCode =
        err instanceof Error && "code" in err
          ? (err as Error & { code?: string }).code
          : undefined;
      if (pgCode === "23505") {
        return codedApiError(409, "connector.integration.mappingExists");
      }
      throw err;
    }
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[teams.connectors.mappings.post]", err);
    return serverError(err);
  }
}
