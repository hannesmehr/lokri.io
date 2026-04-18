import { eq } from "drizzle-orm";
import { Calendar, CreditCard } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { KpiCard } from "@/components/kpi-card";
import { requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { ownerAccounts, plans } from "@/lib/db/schema";
import { formatBytes, formatCurrency, formatDateTime } from "@/lib/i18n/formatters";
import type { Locale } from "@/lib/i18n/config";

function daysUntil(d: Date): number {
  return Math.ceil((d.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

/**
 * Overview tab — shows effective plan, expiry, next steps.
 * Purchase table lives on /billing/plans.
 */
export default async function BillingOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ cancelled?: string }>;
}) {
  const { ownerAccountId } = await requireSessionWithAccount();
  const { cancelled } = await searchParams;
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("billing.overview");

  const [account, currentPlanRow] = await Promise.all([
    db
      .select()
      .from(ownerAccounts)
      .where(eq(ownerAccounts.id, ownerAccountId))
      .limit(1)
      .then((r) => r[0]),
    // Effective plan: paid plan while not expired, otherwise free.
    db
      .select()
      .from(plans)
      .where(eq(plans.id, "free"))
      .limit(1)
      .then((r) => r[0]),
  ]);

  const now = new Date();
  const expired =
    account?.planExpiresAt && account.planExpiresAt < now ? true : false;
  const effectivePlanId = expired ? "free" : (account?.planId ?? "free");

  let effectivePlan = currentPlanRow;
  if (effectivePlanId !== "free") {
    const [row] = await db
      .select()
      .from(plans)
      .where(eq(plans.id, effectivePlanId))
      .limit(1);
    if (row) effectivePlan = row;
  }

  const daysLeft =
    account?.planExpiresAt && !expired ? daysUntil(account.planExpiresAt) : null;

  return (
    <div className="space-y-6">
      {cancelled ? (
        <Alert>
          <AlertTitle>{t("cancelled.title")}</AlertTitle>
          <AlertDescription>
            {t("cancelled.description")}
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-muted">
                <CreditCard className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <CardTitle className="text-lg font-semibold">
                  {t("currentPlanLabel")}:{" "}
                  <span className="font-mono text-foreground">{effectivePlanId}</span>
                </CardTitle>
                <CardDescription>
                  {effectivePlan
                    ? t("currentPlanDescription", {
                        storage: formatBytes(effectivePlan.maxBytes, locale),
                        files: effectivePlan.maxFiles,
                        notes: effectivePlan.maxNotes,
                      })
                    : null}
                </CardDescription>
              </div>
            </div>
            <Button
              nativeButton={false}
              render={<Link href="/billing/plans">{t("changePlan")}</Link>}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <KpiCard
              label={t("kpis.status")}
              value={
                expired
                  ? t("status.expired")
                  : account?.planExpiresAt
                    ? t("status.active")
                    : t("status.free")
              }
              meta={
                expired ? (
                  <Badge variant="outline">{t("status.expired")}</Badge>
                ) : null
              }
            />
            <KpiCard
              label={t("kpis.expiresAt")}
              value={
                account?.planExpiresAt
                  ? formatDateTime(account.planExpiresAt, locale)
                  : t("noExpiry")
              }
              meta={
                daysLeft !== null && !expired
                  ? t("daysLeft", { count: daysLeft })
                  : undefined
              }
            />
            <KpiCard
              label={t("kpis.renewedAt")}
              value={
                account?.planRenewedAt
                  ? formatDateTime(account.planRenewedAt, locale)
                  : "—"
              }
            />
          </div>
        </CardContent>
      </Card>

      {effectivePlanId === "free" ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
            <div>
              <div className="font-medium">{t("upgrade.title")}</div>
              <p className="text-sm text-muted-foreground">
                {t("upgrade.description", {
                  monthly: formatCurrency(490, locale),
                  yearly: formatCurrency(4900, locale),
                })}
              </p>
            </div>
            <Button
              nativeButton={false}
              render={<Link href="/billing/plans">{t("upgrade.cta")}</Link>}
            />
          </CardContent>
        </Card>
      ) : expired ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
            <div className="flex items-start gap-3">
              <Calendar className="mt-0.5 h-5 w-5 text-muted-foreground" />
              <div>
                <div className="font-medium">{t("expired.title")}</div>
                <p className="text-sm text-muted-foreground">
                  {t("expired.description")}
                </p>
              </div>
            </div>
            <Button
              nativeButton={false}
              render={<Link href="/billing/plans">{t("expired.cta")}</Link>}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
