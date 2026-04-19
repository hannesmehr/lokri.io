import { eq, sql } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { WidgetCard } from "@/components/ui/widget-card";
import { requireTeamAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { ownerAccountMembers, ownerAccounts, plans } from "@/lib/db/schema";
import type { Locale } from "@/lib/i18n/config";
import { formatDate } from "@/lib/i18n/formatters";
import { TeamDeleteCard } from "./_delete-card";
import { TeamNameForm } from "./_name-form";
import { TeamTabs } from "./_tabs";

/**
 * Team-Übersicht (Settings-Redesign Block 3).
 *
 * Landing-Dashboard für Team-Accounts. Layout analog zu
 * `/settings/general`:
 *
 *   1. PageHeader („Team")
 *   2. TeamTabs (Übersicht aktiv)
 *   3. Widget-Grid: Team / Plan / Deine Rolle
 *   4. Team-Name-Edit-Card (nur für Owner + Admin)
 *   5. Danger-Zone (Team löschen, nur für Owner)
 *
 * Guard: `requireTeamAccount()` läuft im Layout — Personal-Accounts
 * landen auf `/dashboard?teamRequired=1` + Toast.
 */
export default async function TeamOverviewPage() {
  const { ownerAccountId, role } = await requireTeamAccount();
  const locale = (await getLocale()) as Locale;

  const [team] = await db
    .select({
      id: ownerAccounts.id,
      name: ownerAccounts.name,
      planId: ownerAccounts.planId,
      planExpiresAt: ownerAccounts.planExpiresAt,
    })
    .from(ownerAccounts)
    .where(eq(ownerAccounts.id, ownerAccountId))
    .limit(1);
  if (!team) notFound();

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ownerAccountMembers)
    .where(eq(ownerAccountMembers.ownerAccountId, ownerAccountId));
  const memberCount = Number(count ?? 0);

  const [planRow] = await db
    .select({ id: plans.id })
    .from(plans)
    .where(eq(plans.id, team.planId))
    .limit(1);

  const tHeader = await getTranslations("team.pageHeader.overview");
  const tWidgetTeam = await getTranslations("team.widgets.team");
  const tWidgetPlan = await getTranslations("team.widgets.plan");
  const tWidgetRole = await getTranslations("team.widgets.role");
  const tOverview = await getTranslations("team.overview");
  const tEnumsRole = await getTranslations("enums.role");
  const tEnumsPlan = await getTranslations("enums.planName");

  const planLabel = (planId: string) => {
    try {
      return tEnumsPlan(planId as "free" | "starter" | "pro" | "business" | "team");
    } catch {
      return planId;
    }
  };

  const canEdit = role === "owner" || role === "admin";

  return (
    <div className="space-y-6">
      <PageHeader
        title={tHeader("title")}
        description={tHeader("description")}
      />
      <TeamTabs />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 [&>*]:h-full">
        <WidgetCard
          label={tWidgetTeam("label")}
          value={team.name}
          hint={tWidgetTeam("hintMembers", { count: memberCount })}
        />
        <WidgetCard
          label={tWidgetPlan("label")}
          value={planLabel(planRow?.id ?? team.planId)}
          hint={
            team.planExpiresAt
              ? tWidgetPlan("hintRenewal", {
                  date: formatDate(team.planExpiresAt, locale),
                })
              : tWidgetPlan("hintNoRenewal")
          }
          action={
            <Link
              href="/settings/billing"
              className="underline-offset-4 hover:underline"
            >
              {tWidgetPlan("openBilling")}
            </Link>
          }
        />
        <WidgetCard
          label={tWidgetRole("label")}
          value={tEnumsRole(role)}
        />
      </div>

      {/* Team-Name-Bearbeiten-Card (Owner + Admin) */}
      <Card>
        <CardHeader>
          <CardTitle>{tOverview("nameLabel")}</CardTitle>
          <CardDescription>{tOverview("nameDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <TeamNameForm
            teamId={team.id}
            initialName={team.name}
            canEdit={canEdit}
          />
        </CardContent>
      </Card>

      {/* Danger-Zone (nur Owner) */}
      {role === "owner" ? (
        <TeamDeleteCard teamId={team.id} teamName={team.name} />
      ) : null}
    </div>
  );
}
