/**
 * `PUT /api/teams/[id]/connectors/[integrationId]/credentials`
 *
 * Credentials-Rotation. Separater Endpoint (nicht als Teil des PATCH-
 * Integration), damit:
 *   - Separater Audit-Event `team.connector.credentials_rotated`
 *   - Eigenes Rate-Limit-Budget (`connectorAction` — matched
 *     `/validate`/`/test`, weil der Upstream-Call gleich teuer ist)
 *   - Der Client weiss eindeutig, dass sensitives Material
 *     transmittiert wird
 *
 * Flow: credentials werden gegen Upstream getestet (testCredentials),
 * bei fail abort ohne DB-Touch. Bei ok: verschlüsselt persistiert via
 * `updateIntegrationCredentials`, `last_error` wird gecleart.
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
import { updateIntegrationCredentials } from "@/lib/connectors/integrations";
import { ConfluenceCloudProvider } from "@/lib/connectors/providers/confluence-cloud/provider";
import {
  rateLimitConnectorAction,
  requireConnectorAdmin,
} from "@/lib/teams/connectors-api";
import { rotateCredentialsSchema } from "@/lib/teams/connectors-schemas";
import { loadIntegrationDetail } from "@/lib/teams/connectors-views";

export const runtime = "nodejs";
export const maxDuration = 30;

type Params = {
  params: Promise<{ id: string; integrationId: string }>;
};

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { id: teamId, integrationId } = await params;
    const auth = await requireConnectorAdmin(teamId);
    if (!auth.ok) return auth.error;

    const rate = await rateLimitConnectorAction(auth.session.user.id);
    if (rate) return rate;

    const body = await parseJsonBody(req, 8 * 1024);
    const parsed = rotateCredentialsSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);
    const input = parsed.data;

    const detail = await loadIntegrationDetail(integrationId, teamId);
    if (!detail) {
      return codedApiError(404, "connector.integration.notFound");
    }

    // Connector-Type-Matching: Rotation-Body muss zur Integration passen.
    if (input.connector_type !== detail.connectorType) {
      return codedApiError(
        400,
        "connector.integration.connectorTypeMismatch",
      );
    }

    if (input.connector_type !== "confluence-cloud") {
      return codedApiError(400, "connector.integration.unsupportedType");
    }

    // Pre-Persist-Test gegen Upstream.
    const provider = new ConfluenceCloudProvider({ timeoutMs: 10_000 });
    const testResult = await provider.testCredentials(
      input.credentials,
      input.config,
    );
    if (!testResult.ok) {
      await logAuditEvent({
        ownerAccountId: teamId,
        actorUserId: auth.session.user.id,
        action: "team.connector.credentials_rotated",
        targetType: "connector-integration",
        targetId: integrationId,
        metadata: { success: false },
      });
      return codedApiError(
        400,
        "connector.integration.credentialsRejected",
        { message: testResult.message },
      );
    }

    // Note: config kann sich beim Rotate mit-ändern (siteUrl-Migration
    // innerhalb atlassian.net). `updateIntegrationCredentials` clearet
    // `last_error`; config-Update läuft via separatem `updateIntegration`-
    // Call, damit der Credentials-Update-Pfad sauber bleibt.
    await updateIntegrationCredentials(integrationId, input.credentials);
    // Config separat persistieren (z.B. bei siteUrl-Änderung)
    const { updateIntegration } = await import(
      "@/lib/connectors/integrations"
    );
    await updateIntegration(integrationId, { config: input.config });

    await logAuditEvent({
      ownerAccountId: teamId,
      actorUserId: auth.session.user.id,
      action: "team.connector.credentials_rotated",
      targetType: "connector-integration",
      targetId: integrationId,
      metadata: {
        success: true,
        siteUrlChanged:
          (detail.config as { siteUrl?: string }).siteUrl !==
          input.config.siteUrl,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[teams.connectors.credentials.put]", err);
    return serverError(err);
  }
}
