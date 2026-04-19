import { asc, eq } from "drizzle-orm";
import { Check } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
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
import { ownerAccounts, plans } from "@/lib/db/schema";
import type { Locale } from "@/lib/i18n/config";
import { formatBytes, formatCurrency } from "@/lib/i18n/formatters";
import { UpgradeButton } from "../_upgrade-button";

/**
 * Plan-Wechsel-Flow (Settings-Redesign Block 2).
 *
 * Sub-Route von `/settings/billing` — **ohne** SettingsTabs, weil
 * Prinzip 5 aus `docs/USER_SETTINGS_DESIGN.md` sagt: Conversion-Flows
 * gehören in Sub-Routen, nicht als Tab-Ebene. Die Breadcrumbs im
 * PageHeader (Einstellungen › Billing › Pläne) übernehmen die
 * Hierarchie-Sichtbarkeit.
 *
 * Akquisitions-Tabelle mit allen kaufbaren Plans. Nach Kauf
 * redirectet PayPal auf `/settings/billing/success`.
 */
export default async function BillingPlansPage() {
  const { ownerAccountId } = await requireSessionWithAccount();
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("settings.billing.plansPage");
  const tLayout = await getTranslations("settings");
  const [account, allPlans] = await Promise.all([
    db
      .select()
      .from(ownerAccounts)
      .where(eq(ownerAccounts.id, ownerAccountId))
      .limit(1)
      .then((r) => r[0]),
    db.select().from(plans).orderBy(asc(plans.sortOrder)),
  ]);

  const now = new Date();
  const expired =
    account?.planExpiresAt && account.planExpiresAt < now ? true : false;
  const currentPlanId = expired ? "free" : (account?.planId ?? "free");
  const purchasable = allPlans.filter((p) => p.isPurchasable);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: tLayout("title"), href: "/settings/general" },
          { label: tLayout("navigation.billing"), href: "/settings/billing" },
          { label: t("title") },
        ]}
        title={t("title")}
        description={t("subtitle")}
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {purchasable.map((plan) => {
        const isCurrent = plan.id === currentPlanId;
        const yearlySavingsPct = Math.round(
          (1 - plan.priceYearlyCents / 12 / plan.priceMonthlyCents) * 100,
        );
        const featureKeys = [
          t("features.storage", { bytes: formatBytes(plan.maxBytes, locale) }),
          t("features.files", { count: plan.maxFiles }),
          t("features.notes", { count: plan.maxNotes }),
          t("features.search"),
          t("features.privacy"),
        ];
        return (
          <Card
            key={plan.id}
            className={isCurrent ? "border-brand" : undefined}
          >
            {plan.id === "pro" ? (
              <div className="absolute right-3 top-3">
                <Badge variant="outline">{t("recommended")}</Badge>
              </div>
            ) : null}
            <CardHeader>
              <CardTitle className="text-2xl font-semibold tracking-tight">
                <span className="font-mono">{plan.id}</span>
              </CardTitle>
              <CardDescription className="min-h-[2.5rem]">
                {plan.description}
              </CardDescription>
              <div className="pt-3">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-semibold tabular-nums">
                    {formatCurrency(plan.priceMonthlyCents, locale)}
                  </span>
                  <span className="font-mono text-sm text-muted-foreground">
                    {t("perMonth")}
                  </span>
                </div>
                {plan.priceYearlyCents > 0 ? (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {t("yearlyOption", {
                      price: formatCurrency(plan.priceYearlyCents, locale),
                      discount: yearlySavingsPct,
                    })}
                  </div>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="space-y-1.5 text-sm">
                {featureKeys.map((feature) => (
                  <Feature key={feature}>{feature}</Feature>
                ))}
              </ul>
              {isCurrent ? (
                <div className="rounded-md border bg-muted/40 p-2 text-center text-xs text-muted-foreground">
                  {t("currentBadge")}
                </div>
              ) : (
                <div className="flex flex-col gap-2 pt-2">
                  <UpgradeButton
                    planId={plan.id}
                    period="yearly"
                    label={`${t("period.yearly")} · ${formatCurrency(plan.priceYearlyCents, locale)}`}
                    className="w-full"
                  />
                  <UpgradeButton
                    planId={plan.id}
                    period="monthly"
                    label={`${t("period.monthly")} · ${formatCurrency(plan.priceMonthlyCents, locale)}`}
                    className="w-full"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
      </div>
    </div>
  );
}

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span>{children}</span>
    </li>
  );
}
