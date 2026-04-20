import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { requireTeamAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { spaces as spacesTable } from "@/lib/db/schema";
import { canManageConnectorsForTeam } from "@/lib/teams/permissions";
import { TeamTabs } from "../../../_tabs";
import { ConfluenceSetupWizard } from "./_wizard";

/**
 * Setup-Wizard-Shell für Confluence Cloud.
 *
 * Server-Component lädt:
 *   - Team-Spaces (für Step-3-Mapping-Dropdown)
 *   - Owner-Guard
 *
 * Der eigentliche Multi-Step-State lebt im `ConfluenceSetupWizard`-
 * Client-Component. Browser-Reload verliert den State (MVP-accepted,
 * Credentials lassen sich kurz neu eingeben).
 */
export default async function NewConfluenceConnectorPage() {
  const { ownerAccountId, session } = await requireTeamAccount();
  const canManage = await canManageConnectorsForTeam(
    session.user.id,
    ownerAccountId,
  );
  if (!canManage) redirect("/team/connectors");

  const [tConnectors, teamSpaces] = await Promise.all([
    getTranslations("team.connectors"),
    db
      .select({ id: spacesTable.id, name: spacesTable.name })
      .from(spacesTable)
      .where(eq(spacesTable.ownerAccountId, ownerAccountId))
      .orderBy(spacesTable.name),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: tConnectors("tabLabel"), href: "/team/connectors" },
          { label: tConnectors("setup.breadcrumb") },
        ]}
        title={tConnectors("setup.title")}
        description={tConnectors("setup.description")}
      />
      <TeamTabs />
      <ConfluenceSetupWizard
        teamId={ownerAccountId}
        teamSpaces={teamSpaces}
      />
    </div>
  );
}
