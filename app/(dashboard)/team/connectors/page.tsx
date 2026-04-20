import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireTeamAccount } from "@/lib/api/session";
import { formatRelative } from "@/lib/i18n/formatters";
import type { Locale } from "@/lib/i18n/config";
import { canManageConnectorsForTeam } from "@/lib/teams/permissions";
import { listIntegrationsWithStats } from "@/lib/teams/connectors-views";
import { TeamTabs } from "../_tabs";

/**
 * Team-Connector-Übersicht. Landing-Page der Connector-Sektion.
 *
 * - Server-Component: lädt alle Integrationen des Teams mit Scope/
 *   Mapping-Counts in einem Server-Render.
 * - Owner sehen „Neue Verbindung"-Button; Members sehen nur Liste
 *   (read-only).
 * - Leerzustand: prominenter Call-to-Action zu /new, statt
 *   Platzhalter-Cards.
 *
 * Rendering-Strategie: einfache Card-Liste, ein Eintrag pro Integration.
 * Status-Badge + Counts inline. Detail-Edit über Row-Click (/[id]).
 */
export default async function TeamConnectorsPage() {
  const { ownerAccountId, session } = await requireTeamAccount();
  const locale = (await getLocale()) as Locale;

  const [tConnectors, tSecurity, integrations, canManage] = await Promise.all([
    getTranslations("team.connectors"),
    getTranslations("team.security"),
    listIntegrationsWithStats(ownerAccountId),
    canManageConnectorsForTeam(session.user.id, ownerAccountId),
  ]);
  // tSecurity ist nicht direkt gebraucht; dient nur zur Preload-Symmetrie
  // falls wir die Fallback-Admin-Warnung irgendwann auch hier zeigen.
  void tSecurity;

  const fmtRelative = (d: Date | null) =>
    d ? formatRelative(d, locale) : tConnectors("detail.lastTestedNever");

  return (
    <div className="space-y-6">
      <PageHeader
        title={tConnectors("overview.title")}
        description={tConnectors("overview.description")}
        actions={
          canManage ? (
            <Link
              href="/team/connectors/new"
              className={buttonVariants({ variant: "default" })}
            >
              {tConnectors("overview.newConnection")}
            </Link>
          ) : null
        }
      />
      <TeamTabs />

      {integrations.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{tConnectors("overview.emptyTitle")}</CardTitle>
            <CardDescription>
              {tConnectors("overview.emptyDescription")}
            </CardDescription>
          </CardHeader>
          {canManage ? (
            <CardContent>
              <Link
                href="/team/connectors/new"
                className={buttonVariants({ variant: "default" })}
              >
                {tConnectors("overview.emptyCta")}
              </Link>
            </CardContent>
          ) : null}
        </Card>
      ) : (
        <div className="space-y-3">
          {integrations.map((i) => (
            <Card key={i.id} className="overflow-hidden">
              <Link
                href={`/team/connectors/${i.id}`}
                className="block transition hover:bg-muted/50"
              >
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <CardTitle className="truncate text-base">
                        {i.displayName}
                      </CardTitle>
                      <CardDescription className="truncate font-mono text-xs">
                        {i.connectorType}
                      </CardDescription>
                    </div>
                    <StatusBadge
                      enabled={i.enabled}
                      lastError={i.lastError}
                      t={tConnectors}
                    />
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4 text-sm text-muted-foreground sm:grid-cols-3">
                  <div>
                    <div className="text-xs uppercase tracking-wide">
                      {tConnectors("overview.scopesLabel")}
                    </div>
                    <div className="mt-1 font-medium text-foreground">
                      {i.scopeCount}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide">
                      {tConnectors("overview.mappingsLabel")}
                    </div>
                    <div className="mt-1 font-medium text-foreground">
                      {i.mappingCount}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide">
                      {tConnectors("overview.lastTestedLabel")}
                    </div>
                    <div className="mt-1 text-foreground">
                      {fmtRelative(i.lastTestedAt)}
                    </div>
                  </div>
                </CardContent>
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({
  enabled,
  lastError,
  t,
}: {
  enabled: boolean;
  lastError: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}) {
  let label: string;
  let color: string;
  if (lastError) {
    label = t("overview.statusAuthFailed");
    color =
      "bg-red-50 text-red-900 ring-red-200 dark:bg-red-950/40 dark:text-red-200 dark:ring-red-900";
  } else if (!enabled) {
    label = t("overview.statusDisabled");
    color =
      "bg-gray-50 text-gray-700 ring-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:ring-gray-800";
  } else {
    label = t("overview.statusActive");
    color =
      "bg-emerald-50 text-emerald-900 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-900";
  }
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${color}`}
    >
      {label}
    </span>
  );
}
