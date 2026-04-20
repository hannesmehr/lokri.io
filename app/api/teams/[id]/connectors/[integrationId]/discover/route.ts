/**
 * `POST /api/teams/[id]/connectors/[integrationId]/discover`
 *
 * Post-Persist-Discover: Nutzt die gespeicherten Credentials und ruft
 * `discoverScopes` gegen den Upstream. Für Scope-Update-Flow auf der
 * Detail-Seite („Scopes aktualisieren"-Button) — zeigt den User die
 * aktuelle Liste der Upstream-Spaces inkl. bereits in der Allowlist
 * befindlicher (markiert).
 *
 * Rate-limited. Persistiert nichts — der User nimmt die Liste, wählt
 * aus, schickt's per `PUT /scopes` zurück.
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  ApiAuthError,
  authErrorResponse,
  codedApiError,
  serverError,
} from "@/lib/api/errors";
import { logAuditEvent } from "@/lib/audit/log";
import { getIntegrationForAccount } from "@/lib/connectors/integrations";
import { decryptConnectorCredentials } from "@/lib/connectors/encryption";
import { ConnectorUpstreamError } from "@/lib/connectors/errors";
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

    const provider = new ConfluenceCloudProvider({ timeoutMs: 15_000 });
    let scopes;
    try {
      scopes = await provider.discoverScopes(credentials, integration.config);
    } catch (err) {
      if (err instanceof ConnectorUpstreamError) {
        return codedApiError(
          503,
          "connector.integration.upstreamUnreachable",
          { message: err.message },
        );
      }
      throw err;
    }

    await logAuditEvent({
      ownerAccountId: teamId,
      actorUserId: auth.session.user.id,
      action: "team.connector.discovered",
      targetType: "connector-integration",
      targetId: integrationId,
      metadata: { scopeCount: scopes.length },
    });

    return NextResponse.json({
      scopes: scopes.map((s) => ({
        scope_type: s.type,
        scope_identifier: s.identifier,
        scope_metadata: s.metadata ?? null,
      })),
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[teams.connectors.discover]", err);
    return serverError(err);
  }
}
