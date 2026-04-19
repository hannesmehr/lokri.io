import { eq } from "drizzle-orm";
import { KeyRound } from "lucide-react";
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
import { WidgetCard } from "@/components/ui/widget-card";
import { requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { embeddingKeys, ownerAccounts, plans } from "@/lib/db/schema";
import { formatBytes, formatDate } from "@/lib/i18n/formatters";
import type { Locale } from "@/lib/i18n/config";
import { getLocale } from "next-intl/server";
import { EmbeddingKeyManager } from "./_embedding-key-manager";
import { SettingsScopeHint } from "../_scope-hint";
import { SettingsTabs } from "../_tabs";

/**
 * General-Settings — Widget-Dashboard.
 *
 * Settings-Redesign Block 1: ehemals zwei nebeneinandergestellte Cards
 * (Account + Plan), jetzt ein 3-Widget-Grid (Account / Plan / Speicher)
 * plus eingebettete Embedding-Key-Section (Content aus der
 * verschwundenen Sub-Route `/settings/embedding-key`).
 *
 * Layout:
 *   1. `<PageHeader>`
 *   2. `<SettingsTabs />`
 *   3. `<SettingsScopeHint />`
 *   4. Widget-Grid (3 Spalten auf Desktop, 1 Spalte mobil)
 *   5. Embedding-Key-Section (full-width Card)
 *
 * Keine Danger-Zone auf dieser Seite — Konto-Löschen lebt auf
 * `/profile/data`, Team-Löschen auf `/team` (siehe
 * `docs/USER_SETTINGS_DESIGN.md`).
 */
export default async function SettingsGeneralPage() {
  const { ownerAccountId, accountType } = await requireSessionWithAccount();
  const locale = (await getLocale()) as Locale;

  const [[account], [embeddingKey]] = await Promise.all([
    db
      .select({
        id: ownerAccounts.id,
        name: ownerAccounts.name,
        planId: ownerAccounts.planId,
        planExpiresAt: ownerAccounts.planExpiresAt,
        planRenewedAt: ownerAccounts.planRenewedAt,
        maxBytes: plans.maxBytes,
      })
      .from(ownerAccounts)
      .innerJoin(plans, eq(plans.id, ownerAccounts.planId))
      .where(eq(ownerAccounts.id, ownerAccountId))
      .limit(1),
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
  ]);

  const tHeader = await getTranslations("settings.general.pageHeader");
  const tWidgetAccount = await getTranslations("settings.general.widgets.account");
  const tWidgetPlan = await getTranslations("settings.general.widgets.plan");
  const tWidgetStorage = await getTranslations(
    "settings.general.widgets.storage",
  );
  const tWidgetEmbedding = await getTranslations(
    "settings.general.widgets.embeddingKey",
  );
  const tEnumsAccount = await getTranslations("enums.accountType");
  const tEnumsPlan = await getTranslations("enums.planName");

  const planLabel = (planId: string) => {
    try {
      return tEnumsPlan(planId as "free" | "starter" | "pro" | "business" | "team");
    } catch {
      return planId;
    }
  };

  const renewalHint = account?.planExpiresAt
    ? tWidgetPlan("hintRenewal", {
        date: formatDate(account.planExpiresAt, locale),
      })
    : tWidgetPlan("hintNoRenewal");

  const storageValue = account ? formatBytes(account.maxBytes, locale) : "—";

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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 [&>*]:h-full">
        <WidgetCard
          label={tWidgetAccount("label")}
          value={
            <span className="flex items-center gap-2">
              <span className="truncate">{account?.name ?? "—"}</span>
              <Badge
                variant={accountType === "team" ? "secondary" : "outline"}
                className="shrink-0"
              >
                {tEnumsAccount(accountType)}
              </Badge>
            </span>
          }
          hint={tWidgetAccount("hint")}
        />
        <WidgetCard
          label={tWidgetPlan("label")}
          value={planLabel(account?.planId ?? "free")}
          hint={renewalHint}
          action={
            <Link
              href="/billing"
              className="underline-offset-4 hover:underline"
            >
              {tWidgetPlan("openBilling")}
            </Link>
          }
        />
        <WidgetCard
          label={tWidgetStorage("label")}
          value={storageValue}
          hint={tWidgetStorage("hintAvailable", { max: storageValue })}
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-muted text-muted-foreground">
              <KeyRound className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>{tWidgetEmbedding("sectionTitle")}</CardTitle>
              <CardDescription>
                {tWidgetEmbedding("sectionDescription")}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <EmbeddingKeyManager
            initial={
              embeddingKey
                ? {
                    id: embeddingKey.id,
                    provider: embeddingKey.provider,
                    model: embeddingKey.model,
                    lastUsedAt: embeddingKey.lastUsedAt
                      ? embeddingKey.lastUsedAt.toISOString()
                      : null,
                    createdAt: embeddingKey.createdAt.toISOString(),
                  }
                : null
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
