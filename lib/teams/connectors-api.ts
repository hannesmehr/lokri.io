/**
 * Shared API-Layer-Helper für die `/api/teams/[id]/connectors`-Routen.
 *
 * Zweck: die typischen vier Boilerplate-Schritte am Anfang jeder
 * Connector-Mutation-Route (session → ownership → role-check → rate-
 * limit) in eine Funktion ziehen. Jede Route braucht nur noch die
 * Request-spezifische Body-Validierung + Handler-Logik.
 */

import type { NextResponse } from "next/server";
import type { MemberRole } from "@/lib/auth/roles";
import {
  codedApiError,
  notFound,
} from "@/lib/api/errors";
import { requireSession, type AuthSession } from "@/lib/api/session";
import { db } from "@/lib/db";
import { ownerAccounts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  canManageConnectorsForTeam,
  getTeamRoleForUser,
} from "@/lib/teams/permissions";
import { limit, rateLimitResponse } from "@/lib/rate-limit";

interface TeamAccount {
  id: string;
  type: "personal" | "team";
  name: string;
}

async function loadTeamAccount(id: string): Promise<TeamAccount | null> {
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

export type ConnectorAuthResult =
  | {
      ok: true;
      session: AuthSession;
      account: TeamAccount;
      role: MemberRole;
    }
  | { ok: false; error: NextResponse };

/**
 * Common-Path für alle Connector-Admin-Routes. Führt aus:
 *   1. requireSession() — 401 wenn nicht angemeldet
 *   2. Team existiert + ist type=team
 *   3. User ist Mitglied des Teams (sonst 403)
 *   4. User ist Owner (canManageConnectorsForTeam) — sonst 403
 *
 * Read-Routes können `{ readOnly: true }` setzen — dann reicht
 * Mitgliedschaft ohne Owner-Check. Aktuell von `GET /connectors` +
 * `GET /connectors/[id]` genutzt, damit Mitglieder die Config
 * einsehen aber nur Owner editieren dürfen.
 */
export async function requireConnectorAdmin(
  teamId: string,
  options: { readOnly?: boolean } = {},
): Promise<ConnectorAuthResult> {
  const session = await requireSession();
  const account = await loadTeamAccount(teamId);
  if (!account) {
    return { ok: false, error: notFound("Team not found") };
  }
  if (account.type !== "team") {
    return { ok: false, error: codedApiError(400, "team.notFound") };
  }
  const role = await getTeamRoleForUser(session.user.id, teamId);
  if (!role) {
    return { ok: false, error: codedApiError(403, "team.forbidden") };
  }
  if (!options.readOnly) {
    const canManage = await canManageConnectorsForTeam(
      session.user.id,
      teamId,
    );
    if (!canManage) {
      return {
        ok: false,
        error: codedApiError(403, "connector.integration.notOwner"),
      };
    }
  }
  return { ok: true, session, account, role };
}

/**
 * Rate-Limit-Gate für sensitive Connector-Actions (`/validate`,
 * `/test`, `/discover`, `/credentials`). Geht pro User, nicht pro
 * Team — Credential-Stuffing-Vektor ist individuell. Bei 429 returnt
 * die passende Response.
 */
export async function rateLimitConnectorAction(
  userId: string,
): Promise<NextResponse | null> {
  const result = await limit("connectorAction", `user:${userId}`);
  if (!result.ok) {
    return rateLimitResponse(result) as NextResponse;
  }
  return null;
}
