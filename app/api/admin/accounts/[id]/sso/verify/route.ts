import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import {
  ApiAuthError,
  apiError,
  authErrorResponse,
  notFound,
  serverError,
} from "@/lib/api/errors";
import { requireAdminSession } from "@/lib/api/session";
import { logAdminActionOnAccount } from "@/lib/admin/audit";
import { db } from "@/lib/db";
import { ownerAccounts, teamSsoConfigs } from "@/lib/db/schema";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * Entra-Tenant-Verbindungs-Test.
 *
 * Ruft den OIDC-Discovery-Endpoint von Entra auf:
 *   https://login.microsoftonline.com/{tenantId}/v2.0/.well-known/openid-configuration
 *
 * Erfolg: HTTP 200 + JSON mit erwarteten Feldern. Wir setzen
 * `last_verified_at = now()` und löschen `last_error`.
 *
 * Fehler: Non-200-Status oder Timeout (10s). Wir persistieren den
 * Fehlertext in `last_error`, lassen `last_verified_at` unverändert
 * (der letzte erfolgreiche Check bleibt sichtbar).
 *
 * Audit-Event `admin.account.sso_verified` mit success-Flag +
 * optional-Fehlertext.
 */

const DISCOVERY_TIMEOUT_MS = 10_000;

function discoveryUrl(tenantId: string): string {
  return `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/v2.0/.well-known/openid-configuration`;
}

async function pingEntraDiscovery(
  tenantId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
  try {
    const res = await fetch(discoveryUrl(tenantId), {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      return { ok: false, error: `Entra-Discovery HTTP ${res.status}` };
    }
    const json = (await res.json()) as {
      issuer?: unknown;
      authorization_endpoint?: unknown;
      token_endpoint?: unknown;
    };
    if (
      typeof json.issuer !== "string" ||
      typeof json.authorization_endpoint !== "string" ||
      typeof json.token_endpoint !== "string"
    ) {
      return { ok: false, error: "Unerwartetes Discovery-Response-Format" };
    }
    return { ok: true };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === "AbortError"
          ? `Timeout nach ${DISCOVERY_TIMEOUT_MS}ms`
          : err.message
        : "Unbekannter Fehler beim Discovery-Request";
    return { ok: false, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { userId: actorId } = await requireAdminSession();
    const { id } = await params;

    const [account] = await db
      .select({ id: ownerAccounts.id, type: ownerAccounts.type })
      .from(ownerAccounts)
      .where(eq(ownerAccounts.id, id))
      .limit(1);
    if (!account) return notFound("Account nicht gefunden.");
    if (account.type !== "team") {
      return apiError("SSO ist nur für Team-Accounts verfügbar.", 400, {
        code: "admin.account.notTeam",
      });
    }

    const [config] = await db
      .select({
        tenantId: teamSsoConfigs.tenantId,
      })
      .from(teamSsoConfigs)
      .where(eq(teamSsoConfigs.ownerAccountId, id))
      .limit(1);
    if (!config) {
      return apiError("Keine SSO-Config für diesen Account.", 404, {
        code: "admin.account.ssoNotConfigured",
      });
    }

    const result = await pingEntraDiscovery(config.tenantId);
    const now = new Date();

    if (result.ok) {
      await db
        .update(teamSsoConfigs)
        .set({ lastVerifiedAt: now, lastError: null, updatedAt: now })
        .where(eq(teamSsoConfigs.ownerAccountId, id));
      await logAdminActionOnAccount({
        actorAdminUserId: actorId,
        ownerAccountId: id,
        action: "admin.account.sso_verified",
        targetType: "account",
        targetId: id,
        metadata: {
          success: true,
          tenantId: config.tenantId,
        },
      });
      return NextResponse.json({
        verifiedAt: now.toISOString(),
        error: null,
      });
    }

    // Fehler persistieren, aber lastVerifiedAt NICHT kaputtmachen.
    await db
      .update(teamSsoConfigs)
      .set({ lastError: result.error, updatedAt: now })
      .where(eq(teamSsoConfigs.ownerAccountId, id));
    await logAdminActionOnAccount({
      actorAdminUserId: actorId,
      ownerAccountId: id,
      action: "admin.account.sso_verified",
      targetType: "account",
      targetId: id,
      metadata: {
        success: false,
        tenantId: config.tenantId,
        error: result.error,
      },
    });
    return NextResponse.json({
      verifiedAt: null,
      error: result.error,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[admin.accounts.sso.verify]", err);
    return serverError(err);
  }
}
