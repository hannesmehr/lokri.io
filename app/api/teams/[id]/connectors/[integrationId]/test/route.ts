/**
 * `POST /api/teams/[id]/connectors/[integrationId]/test`
 *
 * Post-Persist-Test: nutzt die gespeicherten Credentials und ruft
 * `testCredentials` gegen den Upstream. Setzt `last_tested_at` +
 * `last_error` — UI zeigt den aktuellen Auth-Status auf der Detail-
 * Seite.
 *
 * Rate-limited (Bucket `connectorAction`). Kein Credential-Transport
 * übers Wire — Credentials bleiben server-side.
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  ApiAuthError,
  authErrorResponse,
  codedApiError,
  serverError,
} from "@/lib/api/errors";
import { logAuditEvent } from "@/lib/audit/log";
import {
  getIntegrationForAccount,
  markIntegrationTested,
} from "@/lib/connectors/integrations";
import { decryptConnectorCredentials } from "@/lib/connectors/encryption";
import { ConfluenceCloudProvider } from "@/lib/connectors/providers/confluence-cloud/provider";
import type { ConfluenceCloudCredentials } from "@/lib/connectors/providers/confluence-cloud/credentials";
import {
  rateLimitConnectorAction,
  requireConnectorAdmin,
} from "@/lib/teams/connectors-api";

export const runtime = "nodejs";
export const maxDuration = 30;

type Params = {
  params: Promise<{ id: string; integrationId: string }>;
};

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { id: teamId, integrationId } = await params;
    const auth = await requireConnectorAdmin(teamId);
    if (!auth.ok) return auth.error;

    const rate = await rateLimitConnectorAction(auth.session.user.id);
    if (rate) return rate;

    const integration = await getIntegrationForAccount(integrationId, teamId);
    if (!integration) {
      return codedApiError(404, "connector.integration.notFound");
    }

    if (integration.connectorType !== "confluence-cloud") {
      return codedApiError(400, "connector.integration.unsupportedType");
    }

    const credentials = decryptConnectorCredentials<ConfluenceCloudCredentials>(
      integration.credentialsEncrypted,
    );

    const provider = new ConfluenceCloudProvider({ timeoutMs: 10_000 });
    const result = await provider.testCredentials(
      credentials,
      integration.config,
    );

    await markIntegrationTested(
      integrationId,
      result.ok,
      result.ok ? null : result.message,
    );

    await logAuditEvent({
      ownerAccountId: teamId,
      actorUserId: auth.session.user.id,
      action: "team.connector.tested",
      targetType: "connector-integration",
      targetId: integrationId,
      metadata: { success: result.ok },
    });

    return NextResponse.json({
      ok: result.ok,
      message: result.message,
      diagnostics: result.diagnostics ?? null,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[teams.connectors.test]", err);
    return serverError(err);
  }
}
