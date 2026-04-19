import { eq } from "drizzle-orm";
import { KeyRound } from "lucide-react";
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
import { embeddingKeys, ownerAccounts } from "@/lib/db/schema";
import { SettingsScopeHint } from "../_scope-hint";
import { SettingsTabs } from "../_tabs";
import { EmbeddingKeyManager } from "./_embedding-key-manager";

export default async function EmbeddingKeyPage() {
  const { ownerAccountId, accountType } = await requireSessionWithAccount();
  const t = await getTranslations("settings.embeddingKey");
  const tHeader = await getTranslations("settings.embeddingKey.pageHeader");
  const tLayout = await getTranslations("settings");

  const [[row], [account]] = await Promise.all([
    db
      .select({
        id: embeddingKeys.id,
        provider: embeddingKeys.provider,
        model: embeddingKeys.model,
        lastUsedAt: embeddingKeys.lastUsedAt,
        createdAt: embeddingKeys.createdAt,
      })
      .from(embeddingKeys)
      .where(eq(embeddingKeys.ownerAccountId, ownerAccountId))
      .limit(1),
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
          { label: tLayout("navigation.embeddingKey") },
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
            <div className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-muted text-muted-foreground">
              <KeyRound className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>{t("heading")}</CardTitle>
              <CardDescription>{t("description")}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <EmbeddingKeyManager
            initial={
              row
                ? {
                    id: row.id,
                    provider: row.provider,
                    model: row.model,
                    lastUsedAt: row.lastUsedAt
                      ? row.lastUsedAt.toISOString()
                      : null,
                    createdAt: row.createdAt.toISOString(),
                  }
                : null
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
