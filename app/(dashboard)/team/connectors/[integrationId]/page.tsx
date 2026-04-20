import { eq } from "drizzle-orm";
import { AlertTriangle } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { requireTeamAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { spaces as spacesTable } from "@/lib/db/schema";
import type { Locale } from "@/lib/i18n/config";
import { formatRelative } from "@/lib/i18n/formatters";
import { canManageConnectorsForTeam } from "@/lib/teams/permissions";
import { loadIntegrationDetail } from "@/lib/teams/connectors-views";
import { TeamTabs } from "../../_tabs";
import { ConnectorDetailControls } from "./_controls";
import { ConnectorMappingsManager } from "./_mappings-manager";
import { ConnectorScopesManager } from "./_scopes-manager";

/**
 * Detail-Seite für eine einzelne Connector-Integration.
 *
 * Layout (flach — siehe Block 0 Design-Entscheidung):
 *   1. PageHeader mit Breadcrumb
 *   2. TeamTabs
 *   3. Status-Banner (bei last_error)
 *   4. Overview-Card mit Metadata + Controls (display_name, enabled,
 *      test-connection)
 *   5. Credentials-Card mit „Aktualisieren"-Flow
 *   6. Scopes-Card mit Refresh-Flow
 *   7. Mappings-Card mit Add-Modal
 *   8. Danger-Zone
 *
 * Members dürfen lesen (status + structure), Owner dürfen editieren.
 * Non-owner sehen nur Read-Only-Rendering ohne Action-Buttons.
 */

type Params = { params: Promise<{ integrationId: string }> };

export default async function ConnectorDetailPage({ params }: Params) {
  const { integrationId } = await params;
  const { ownerAccountId, session } = await requireTeamAccount();
  const locale = (await getLocale()) as Locale;

  const detail = await loadIntegrationDetail(integrationId, ownerAccountId);
  if (!detail) notFound();

  const canManage = await canManageConnectorsForTeam(
    session.user.id,
    ownerAccountId,
  );

  // Members werden umgeleitet auf die Overview — sie haben keinen
  // echten Use-Case für die Detail-Seite (keine Actions sichtbar, nur
  // technische Details). Wenn sich das ändert, passen wir's hier an.
  if (!canManage) redirect("/team/connectors");

  const [tConnectors, teamSpaces] = await Promise.all([
    getTranslations("team.connectors"),
    db
      .select({ id: spacesTable.id, name: spacesTable.name })
      .from(spacesTable)
      .where(eq(spacesTable.ownerAccountId, ownerAccountId))
      .orderBy(spacesTable.name),
  ]);

  const lastTestedLabel = detail.lastTestedAt
    ? formatRelative(detail.lastTestedAt, locale)
    : tConnectors("detail.lastTestedNever");

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          {
            label: tConnectors("tabLabel"),
            href: "/team/connectors",
          },
          { label: detail.displayName },
        ]}
        title={detail.displayName}
        description={tConnectors("detail.subtitle", {
          connectorType: detail.connectorType,
        })}
      />
      <TeamTabs />

      {detail.lastError ? (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="space-y-1 text-sm">
            <div className="font-medium text-destructive">
              {tConnectors("detail.errorBannerTitle")}
            </div>
            <p className="text-muted-foreground">{detail.lastError}</p>
            <p className="text-muted-foreground">
              {tConnectors("detail.errorBannerHint")}
            </p>
          </div>
        </div>
      ) : null}

      <ConnectorDetailControls
        teamId={ownerAccountId}
        integrationId={detail.id}
        initialDisplayName={detail.displayName}
        initialEnabled={detail.enabled}
        connectorType={detail.connectorType}
        config={detail.config}
        lastTestedLabel={lastTestedLabel}
        hasLastError={Boolean(detail.lastError)}
      />

      <ConnectorScopesManager
        teamId={ownerAccountId}
        integrationId={detail.id}
        connectorType={detail.connectorType}
        initialScopes={detail.scopes.map((s) => ({
          id: s.id,
          scopeType: s.scopeType,
          scopeIdentifier: s.scopeIdentifier,
          metadata: s.scopeMetadata,
          mappingCount: s.mappingCount,
        }))}
      />

      <ConnectorMappingsManager
        teamId={ownerAccountId}
        integrationId={detail.id}
        initialMappings={detail.mappings.map((m) => ({
          id: m.id,
          scopeId: m.scopeId,
          scopeIdentifier: m.scopeIdentifier,
          scopeDisplayName:
            (m.scopeMetadata as { displayName?: string } | null)
              ?.displayName ?? null,
          spaceId: m.spaceId,
          spaceName: m.spaceName,
        }))}
        allScopes={detail.scopes.map((s) => ({
          id: s.id,
          scopeIdentifier: s.scopeIdentifier,
          displayName:
            (s.scopeMetadata as { displayName?: string } | null)
              ?.displayName ?? null,
        }))}
        teamSpaces={teamSpaces}
      />
    </div>
  );
}
