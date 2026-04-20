/**
 * `POST /api/teams/[id]/connectors/validate`
 *
 * Pre-Persist-Credential-Check + Scope-Discovery in einem Call.
 * Setup-Wizard-Step 1-2: Client schickt Credentials + Config → Server
 * ruft `testCredentials` + `discoverScopes` und gibt das Ergebnis zurück.
 * Kein DB-Write — die Integration existiert noch nicht.
 *
 * Rate-Limited (Bucket `connectorAction`, 30 calls / 5 min / user).
 * Primär Schutz gegen Credential-Stuffing: ein kompromittiertes
 * Owner-Konto kann nicht unbegrenzt Tokens gegen Atlassian probieren.
 *
 * Response-Shape:
 *   { ok: true, diagnostics: {...}, scopes: [...] }
 *   { ok: false, error_code, message }
 *
 * Der 2xx-Status + `ok: false`-Body-Pattern ist bewusst — der Test
 * SELBST lief durch (keine Rate-Limit-/Auth-Failure), nur das
 * Credential wurde vom Upstream abgelehnt. UI unterscheidet sauber.
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
import { ConfluenceCloudProvider } from "@/lib/connectors/providers/confluence-cloud/provider";
import {
  requireConnectorAdmin,
  rateLimitConnectorAction,
} from "@/lib/teams/connectors-api";
import { validateCredentialsSchema } from "@/lib/teams/connectors-schemas";

export const runtime = "nodejs";
export const maxDuration = 30;

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id: teamId } = await params;
    const auth = await requireConnectorAdmin(teamId);
    if (!auth.ok) return auth.error;

    const rate = await rateLimitConnectorAction(auth.session.user.id);
    if (rate) return rate;

    const body = await parseJsonBody(req, 8 * 1024);
    const parsed = validateCredentialsSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);
    const input = parsed.data;

    if (input.connector_type !== "confluence-cloud") {
      return codedApiError(400, "connector.integration.unsupportedType");
    }

    const provider = new ConfluenceCloudProvider({ timeoutMs: 10_000 });

    const testResult = await provider.testCredentials(
      input.credentials,
      input.config,
    );

    // Audit: jeder Validate-Versuch wird geloggt (auch fail), damit
    // Credential-Stuffing-Versuche sichtbar sind — auch wenn Rate-
    // Limit greift werden die mit 429-Response gesondert behandelt.
    await logAuditEvent({
      ownerAccountId: teamId,
      actorUserId: auth.session.user.id,
      action: "team.connector.validated",
      targetType: "connector-integration",
      targetId: null,
      metadata: {
        connectorType: input.connector_type,
        success: testResult.ok,
      },
    });

    if (!testResult.ok) {
      return NextResponse.json({
        ok: false,
        error_code: "connector.integration.credentialsRejected",
        message: testResult.message,
      });
    }

    // Credentials valid → Scopes vom Upstream ziehen.
    let scopes;
    try {
      scopes = await provider.discoverScopes(
        input.credentials,
        input.config,
      );
    } catch (err) {
      console.error("[teams.connectors.validate] discover failed:", err);
      return NextResponse.json({
        ok: false,
        error_code: "connector.integration.discoverFailed",
        message:
          err instanceof Error
            ? err.message
            : "Upstream unreachable for scope discovery.",
      });
    }

    return NextResponse.json({
      ok: true,
      diagnostics: testResult.diagnostics ?? {},
      scopes: scopes.map((s) => ({
        scope_type: s.type,
        scope_identifier: s.identifier,
        scope_metadata: s.metadata ?? null,
      })),
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[teams.connectors.validate]", err);
    return serverError(err);
  }
}
