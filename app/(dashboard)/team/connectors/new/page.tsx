import { redirect } from "next/navigation";
import { requireTeamAccount } from "@/lib/api/session";
import { canManageConnectorsForTeam } from "@/lib/teams/permissions";

/**
 * `/team/connectors/new` — Connector-Typ-Auswahl.
 *
 * MVP: nur Confluence Cloud. Bei mehreren Typen (Phase 2: Slack/
 * GitHub/Jira) wird hier eine Auswahl-Grid gerendert. Aktuell: direkt
 * weiterleiten, keine Placeholder-Architektur.
 *
 * Owner-Guard: non-owner bekommen 403 via redirect auf die Overview
 * (der canManageConnectorsForTeam-Check ist dort auch für die
 * Button-Sichtbarkeit — der Server-Redirect hier schließt den
 * direkten URL-Aufruf ab).
 */
export default async function NewConnectorPage() {
  const { ownerAccountId, session } = await requireTeamAccount();
  const canManage = await canManageConnectorsForTeam(
    session.user.id,
    ownerAccountId,
  );
  if (!canManage) redirect("/team/connectors");
  redirect("/team/connectors/new/confluence");
}
