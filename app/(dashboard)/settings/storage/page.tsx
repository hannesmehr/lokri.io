import { asc, eq } from "drizzle-orm";
import { HardDrive } from "lucide-react";
import { getTranslations } from "next-intl/server";
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
import { ownerAccounts, storageProviders } from "@/lib/db/schema";
import { SettingsScopeHint } from "../_scope-hint";
import { SettingsTabs } from "../_tabs";
import { ProviderList } from "./_provider-list";

export default async function StorageSettingsPage() {
  const t = await getTranslations("settings.storage");
  const tHeader = await getTranslations("settings.storage.pageHeader");
  const tLayout = await getTranslations("settings");
  const { ownerAccountId, accountType } = await requireSessionWithAccount();
  const [providers, [account]] = await Promise.all([
    db
      .select({
        id: storageProviders.id,
        name: storageProviders.name,
        type: storageProviders.type,
        createdAt: storageProviders.createdAt,
      })
      .from(storageProviders)
      .where(eq(storageProviders.ownerAccountId, ownerAccountId))
      .orderBy(asc(storageProviders.createdAt)),
    db
      .select({ name: ownerAccounts.name })
      .from(ownerAccounts)
      .where(eq(ownerAccounts.id, ownerAccountId))
      .limit(1),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: tLayout("title"), href: "/settings/general" },
          { label: tLayout("navigation.storage") },
        ]}
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
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg border bg-muted text-foreground">
              <HardDrive className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>{t("pageTitle")}</CardTitle>
              <CardDescription>{t("pageDescription")}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ProviderList initial={providers} />
        </CardContent>
      </Card>
    </div>
  );
}
