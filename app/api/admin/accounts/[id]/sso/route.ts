import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import {
  ApiAuthError,
  apiError,
  authErrorResponse,
  notFound,
  parseJsonBody,
  serverError,
  zodError,
} from "@/lib/api/errors";
import { requireAdminSession } from "@/lib/api/session";
import { logAdminActionOnAccount } from "@/lib/admin/audit";
import {
  ssoConfigSchema,
  type SsoConfigInput,
} from "@/lib/admin/sso-config-schema";
import { getFallbackAdminStatus } from "@/lib/auth/sso";
import { db } from "@/lib/db";
import { ownerAccounts, teamSsoConfigs } from "@/lib/db/schema";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// Kleiner Schuldigkeits-Ping auf den Typ — Schema-Datei wird auch via
// Tests geprüft; hier nur, damit Re-Imports nicht tree-geshaked werden.
void (null as SsoConfigInput | null);

/**
 * Admin-Team-SSO-Konfigurations-Endpoints.
 *
 * Alle vier HTTP-Methoden (GET/PUT/POST(verify)/DELETE) liegen hier
 * und in der Nachbar-Datei `verify/route.ts` — das ist Next-App-Router-
 * Convention (kein POST + PUT im gleichen File + Sub-Path-Mischen).
 *
 * Kontext:
 *   - `requireAdminSession()` gate
 *   - Account-Typ-Check: nur `team` darf SSO-Config haben
 *   - `team_sso_configs` hat UNIQUE auf `owner_account_id` → Upsert
 *   - Fallback-Admin-Guard beim Enable (siehe
 *     `lib/auth/sso.ts::getFallbackAdminStatus`)
 *   - Audit-Events unter `admin.account.sso_*`
 */

async function loadTeamAccount(id: string): Promise<
  | { id: string; type: "personal" | "team"; name: string }
  | null
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

function teamOnly(
  account: Awaited<ReturnType<typeof loadTeamAccount>>,
): NextResponse | null {
  if (!account) return notFound("Account nicht gefunden.");
  if (account.type !== "team") {
    return apiError("SSO ist nur für Team-Accounts verfügbar.", 400, {
      code: "admin.account.notTeam",
    });
  }
  return null;
}

// ── GET ────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requireAdminSession();
    const { id } = await params;

    const account = await loadTeamAccount(id);
    const reject = teamOnly(account);
    if (reject) return reject;

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
      .where(eq(teamSsoConfigs.ownerAccountId, id))
      .limit(1);

    const fallbackAdminStatus = await getFallbackAdminStatus(id);

    return NextResponse.json({
      accountId: id,
      config: config
        ? {
            ...config,
            lastVerifiedAt: config.lastVerifiedAt
              ? config.lastVerifiedAt.toISOString()
              : null,
            createdAt: config.createdAt.toISOString(),
            updatedAt: config.updatedAt.toISOString(),
          }
        : null,
      fallbackAdminStatus,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[admin.accounts.sso.get]", err);
    return serverError(err);
  }
}

// ── PUT (Upsert) ───────────────────────────────────────────────────────

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { userId: actorId } = await requireAdminSession();
    const { id } = await params;

    const account = await loadTeamAccount(id);
    const reject = teamOnly(account);
    if (reject) return reject;

    const body = await parseJsonBody(req, 4096);
    const parsed = ssoConfigSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);
    const input = parsed.data;

    // Fallback-Admin-Guard nur bei Enable. Disablen + Config-Anpassen
    // ist immer erlaubt — nur das Setzen von enabled=true blockieren
    // wir, wenn kein Fallback existiert.
    if (input.enabled) {
      const status = await getFallbackAdminStatus(id);
      if (!status.hasAnyNonSsoAdmin) {
        return apiError(
          "Team hat keinen Admin mit Email/Passwort-Login.",
          409,
          { code: "sso.noFallbackAdmin" },
        );
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
        // Neue Config setzt lastError zurück — alte Fehler sind obsolet.
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

    await logAdminActionOnAccount({
      actorAdminUserId: actorId,
      ownerAccountId: id,
      action: "admin.account.sso_configured",
      targetType: "account",
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
    console.error("[admin.accounts.sso.put]", err);
    return serverError(err);
  }
}

// ── DELETE ─────────────────────────────────────────────────────────────

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { userId: actorId } = await requireAdminSession();
    const { id } = await params;

    const account = await loadTeamAccount(id);
    const reject = teamOnly(account);
    if (reject) return reject;

    // Entfernt nur die team_sso_configs-Row. user_sso_identities
    // bleiben bestehen (FK ist auf users, nicht auf team_sso_configs)
    // — beim erneuten Aktivieren greift Bestands-Linking weiter.
    const result = await db
      .delete(teamSsoConfigs)
      .where(eq(teamSsoConfigs.ownerAccountId, id))
      .returning({ id: teamSsoConfigs.id });

    if (result.length === 0) {
      return apiError("Keine SSO-Config für diesen Account.", 404, {
        code: "admin.account.ssoNotConfigured",
      });
    }

    await logAdminActionOnAccount({
      actorAdminUserId: actorId,
      ownerAccountId: id,
      action: "admin.account.sso_removed",
      targetType: "account",
      targetId: id,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[admin.accounts.sso.delete]", err);
    return serverError(err);
  }
}
