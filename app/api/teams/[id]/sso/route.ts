import { eq } from "drizzle-orm";
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
import { requireSession } from "@/lib/api/session";
import { logAuditEvent } from "@/lib/audit/log";
import {
  getFallbackAdminStatus,
} from "@/lib/auth/sso";
import {
  ssoConfigSchema,
  type SsoConfigInput,
} from "@/lib/admin/sso-config-schema";
import { db } from "@/lib/db";
import { ownerAccounts, teamSsoConfigs } from "@/lib/db/schema";
import {
  canManageSsoForTeam,
  getTeamRoleForUser,
} from "@/lib/teams/permissions";
import {
  buildTeamSsoResponse,
  type TeamSsoConfigSnapshot,
} from "@/lib/teams/sso-config";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

void (null as SsoConfigInput | null);

async function loadTeamAccount(id: string): Promise<
  { id: string; type: "personal" | "team"; name: string } | null
> {
  const [row] = await db
    .select({
      id: ownerAccounts.id,
      type: ownerAccounts.type,
      name: ownerAccounts.name,
    })
    .from(ownerAccounts)
    .where(eq(ownerAccounts.id, id))
    .limit(1);
  return row ?? null;
}

async function loadSsoConfig(
  ownerAccountId: string,
): Promise<TeamSsoConfigSnapshot | null> {
  const [config] = await db
    .select({
      provider: teamSsoConfigs.provider,
      tenantId: teamSsoConfigs.tenantId,
      allowedDomains: teamSsoConfigs.allowedDomains,
      enabled: teamSsoConfigs.enabled,
      lastVerifiedAt: teamSsoConfigs.lastVerifiedAt,
      lastError: teamSsoConfigs.lastError,
      createdAt: teamSsoConfigs.createdAt,
      updatedAt: teamSsoConfigs.updatedAt,
    })
    .from(teamSsoConfigs)
    .where(eq(teamSsoConfigs.ownerAccountId, ownerAccountId))
    .limit(1);
  return config ?? null;
}

async function requireTeamMembership(userId: string, teamId: string) {
  const account = await loadTeamAccount(teamId);
  if (!account) return { error: notFound("Team nicht gefunden.") };
  if (account.type !== "team") {
    return {
      error: codedApiError(400, "team.notFound"),
    };
  }

  const role = await getTeamRoleForUser(userId, teamId);
  if (!role) {
    return {
      error: codedApiError(403, "team.forbidden"),
    };
  }

  return { account, role };
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const session = await requireSession();
    const { id } = await params;

    const membership = await requireTeamMembership(session.user.id, id);
    if ("error" in membership) return membership.error;

    const canManage = await canManageSsoForTeam(session.user.id, id);
    const [config, fallbackAdminStatus] = await Promise.all([
      loadSsoConfig(id),
      canManage ? getFallbackAdminStatus(id) : Promise.resolve(null),
    ]);

    return NextResponse.json(
      buildTeamSsoResponse({
        accountId: id,
        config,
        canManage,
        fallbackAdminStatus,
      }),
    );
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[teams.sso.get]", err);
    return serverError(err);
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const session = await requireSession();
    const { id } = await params;

    const membership = await requireTeamMembership(session.user.id, id);
    if ("error" in membership) return membership.error;

    const canManage = await canManageSsoForTeam(session.user.id, id);
    if (!canManage) {
      return codedApiError(403, "sso.notOwner");
    }

    const body = await parseJsonBody(req, 4096);
    const parsed = ssoConfigSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);
    const input = parsed.data;

    if (input.enabled) {
      const fallbackAdminStatus = await getFallbackAdminStatus(id);
      if (!fallbackAdminStatus.hasAnyNonSsoAdmin) {
        return codedApiError(409, "sso.noFallbackAdmin");
      }
    }

    const [existing] = await db
      .select({
        enabled: teamSsoConfigs.enabled,
        tenantId: teamSsoConfigs.tenantId,
      })
      .from(teamSsoConfigs)
      .where(eq(teamSsoConfigs.ownerAccountId, id))
      .limit(1);

    const now = new Date();
    await db
      .insert(teamSsoConfigs)
      .values({
        ownerAccountId: id,
        provider: "entra",
        tenantId: input.tenantId,
        allowedDomains: input.allowedDomains,
        enabled: input.enabled,
        lastError: null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: teamSsoConfigs.ownerAccountId,
        set: {
          provider: "entra",
          tenantId: input.tenantId,
          allowedDomains: input.allowedDomains,
          enabled: input.enabled,
          lastError: null,
          updatedAt: now,
        },
      });

    await logAuditEvent({
      ownerAccountId: id,
      actorUserId: session.user.id,
      action: "team.sso.configured",
      targetType: "team",
      targetId: id,
      metadata: {
        tenantId: input.tenantId,
        allowedDomains: input.allowedDomains,
        enabled: input.enabled,
        previousEnabled: existing?.enabled ?? null,
        previousTenantId: existing?.tenantId ?? null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[teams.sso.put]", err);
    return serverError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const session = await requireSession();
    const { id } = await params;

    const membership = await requireTeamMembership(session.user.id, id);
    if ("error" in membership) return membership.error;

    const canManage = await canManageSsoForTeam(session.user.id, id);
    if (!canManage) {
      return codedApiError(403, "sso.notOwner");
    }

    const result = await db
      .delete(teamSsoConfigs)
      .where(eq(teamSsoConfigs.ownerAccountId, id))
      .returning({ id: teamSsoConfigs.id });

    if (result.length === 0) {
      return codedApiError(404, "sso.configurationError");
    }

    await logAuditEvent({
      ownerAccountId: id,
      actorUserId: session.user.id,
      action: "team.sso.removed",
      targetType: "team",
      targetId: id,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[teams.sso.delete]", err);
    return serverError(err);
  }
}
