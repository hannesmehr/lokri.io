import { ShieldCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireTeamAccount } from "@/lib/api/session";
import { TeamTabs } from "../_tabs";

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
  await requireTeamAccount();

  const tHeader = await getTranslations("team.pageHeader.security");
  const tLayout = await getTranslations("team.layout");
  const tSso = await getTranslations("team.security.sso");

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: tLayout("title"), href: "/team" },
          { label: tLayout("navigation.security") },
        ]}
        title={tHeader("title")}
        description={tHeader("description")}
      />
      <TeamTabs />

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>{tSso("title")}</CardTitle>
              <CardDescription>{tSso("description")}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="rounded-md border border-dashed bg-muted/40 p-4 text-sm text-muted-foreground">
            {tSso("phasePlaceholder")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
