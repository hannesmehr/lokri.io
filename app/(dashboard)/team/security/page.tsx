import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { requireTeamAccount } from "@/lib/api/session";
import { resolveAppOrigin } from "@/lib/origin";
import { TeamTabs } from "../_tabs";
import { TeamSsoSection } from "./_sso-section";

/**
 * Team-Sicherheit — Phase-3-SSO-Shell (Settings-Redesign Block 3).
 *
 * Placeholder-Seite. Die eigentliche SSO-Config-UI für Team-Owner lebt
 * in der nächsten SSO-Phase (Phase-3 laut `docs/sso-overview-plan.md`).
 * Das Gerüst — Route + Layout + PageHeader + TeamTabs — steht heute,
 * damit Phase 3 nur noch den Card-Content austauschen muss.
 *
 * Super-Admins können SSO bereits heute über `/admin/accounts/[id]`
 * konfigurieren (Phase 2 ist live); diese Team-Owner-Self-Service-
 * Variante folgt.
 */
export default async function TeamSecurityPage() {
  const { ownerAccountId } = await requireTeamAccount();

  const tSecurity = await getTranslations("team.security");
  const tLayout = await getTranslations("team.layout");

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: tLayout("title"), href: "/team" },
          { label: tSecurity("tabLabel") },
        ]}
        title={tSecurity("pageHeading")}
        description={tSecurity("pageDescription")}
      />
      <TeamTabs />

      <TeamSsoSection
        teamId={ownerAccountId}
        appOrigin={resolveAppOrigin()}
        publicAppUrl={process.env.NEXT_PUBLIC_APP_URL ?? resolveAppOrigin()}
        entraClientId={process.env.ENTRA_CLIENT_ID ?? null}
      />
    </div>
  );
}
