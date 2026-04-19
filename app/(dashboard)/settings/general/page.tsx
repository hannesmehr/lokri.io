import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { ownerAccounts } from "@/lib/db/schema";
import { SettingsScopeHint } from "../_scope-hint";
import { SettingsTabs } from "../_tabs";

/**
 * General-Settings — Account-Übersicht für den aktiven Account.
 *
 * Nur Anzeige, kein Edit: Account-Name-Editing für Team-Accounts
 * passiert in `/team` (Block 3), Personal-Accounts übernehmen den Namen
 * vom User-Profil. Hier dient die Page als „hier bin ich gerade
 * eingeloggt"-Bestätigung + Einstieg zur Plan-Verwaltung.
 */
export default async function SettingsGeneralPage() {
  const { ownerAccountId, accountType } = await requireSessionWithAccount();
  const [account] = await db
    .select({
      id: ownerAccounts.id,
      name: ownerAccounts.name,
      planId: ownerAccounts.planId,
    })
    .from(ownerAccounts)
    .where(eq(ownerAccounts.id, ownerAccountId))
    .limit(1);

  const tHeader = await getTranslations("settings.general.pageHeader");
  const tAccount = await getTranslations("settings.general.accountCard");
  const tPlan = await getTranslations("settings.general.planCard");
  const tEnumsAccount = await getTranslations("enums.accountType");
  const tEnumsPlan = await getTranslations("enums.planName");

  const planLabel = (planId: string) => {
    try {
      return tEnumsPlan(planId as "free" | "starter" | "pro" | "business" | "team");
    } catch {
      return planId;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={tHeader("title")}
        description={tHeader("description")}
      />
      <SettingsTabs />
      <SettingsScopeHint
        accountType={accountType}
        accountName={account?.name ?? ""}
      />

      <Card>
        <CardHeader>
          <CardTitle>{tAccount("title")}</CardTitle>
          <CardDescription>{tAccount("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-[max-content_1fr] sm:gap-x-6 sm:gap-y-2">
            <dt className="text-sm text-muted-foreground">
              {tAccount("nameLabel")}
            </dt>
            <dd className="text-sm font-medium">{account?.name ?? "—"}</dd>
            <dt className="text-sm text-muted-foreground">Typ</dt>
            <dd>
              <Badge variant={accountType === "team" ? "secondary" : "outline"}>
                {tEnumsAccount(accountType)}
              </Badge>
            </dd>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tPlan("title")}</CardTitle>
          <CardDescription>{tPlan("description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <Badge variant="outline" className="font-mono">
            {planLabel(account?.planId ?? "free")}
          </Badge>
          <Link
            href="/billing"
            className="text-sm underline-offset-4 hover:underline"
          >
            {tPlan("manageLink")}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
