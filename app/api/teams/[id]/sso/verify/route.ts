import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import {
  ApiAuthError,
  authErrorResponse,
  codedApiError,
  notFound,
  serverError,
} from "@/lib/api/errors";
import { requireSession } from "@/lib/api/session";
import { logAuditEvent } from "@/lib/audit/log";
import { db } from "@/lib/db";
import { ownerAccounts, teamSsoConfigs } from "@/lib/db/schema";
import {
  canManageSsoForTeam,
  getTeamRoleForUser,
} from "@/lib/teams/permissions";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

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

async function requireOwnerForTeamSso(userId: string, teamId: string) {
  const [account] = await db
    .select({ id: ownerAccounts.id, type: ownerAccounts.type })
    .from(ownerAccounts)
    .where(eq(ownerAccounts.id, teamId))
    .limit(1);

  if (!account) return { error: notFound("Team nicht gefunden.") };
  if (account.type !== "team") return { error: codedApiError(400, "team.notFound") };

  const role = await getTeamRoleForUser(userId, teamId);
  if (!role) return { error: codedApiError(403, "team.forbidden") };

  const canManage = await canManageSsoForTeam(userId, teamId);
  if (!canManage) return { error: codedApiError(403, "sso.notOwner") };

  return { ok: true as const };
}

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const session = await requireSession();
    const { id } = await params;

    const access = await requireOwnerForTeamSso(session.user.id, id);
    if ("error" in access) return access.error;

    const [config] = await db
      .select({ tenantId: teamSsoConfigs.tenantId })
      .from(teamSsoConfigs)
      .where(eq(teamSsoConfigs.ownerAccountId, id))
      .limit(1);

    if (!config) {
      return codedApiError(404, "sso.configurationError");
    }

    const result = await pingEntraDiscovery(config.tenantId);
    const now = new Date();

    if (result.ok) {
      await db
        .update(teamSsoConfigs)
        .set({ lastVerifiedAt: now, lastError: null, updatedAt: now })
        .where(eq(teamSsoConfigs.ownerAccountId, id));

      await logAuditEvent({
        ownerAccountId: id,
        actorUserId: session.user.id,
        action: "team.sso.verified",
        targetType: "team",
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

    await db
      .update(teamSsoConfigs)
      .set({ lastError: result.error, updatedAt: now })
      .where(eq(teamSsoConfigs.ownerAccountId, id));

    await logAuditEvent({
      ownerAccountId: id,
      actorUserId: session.user.id,
      action: "team.sso.verified",
      targetType: "team",
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
    console.error("[teams.sso.verify]", err);
    return serverError(err);
  }
}
