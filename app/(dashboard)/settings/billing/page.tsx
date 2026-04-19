import { desc, eq } from "drizzle-orm";
import { Calendar, CreditCard, Download, FileText } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
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
import { PageHeader } from "@/components/ui/page-header";
import { requireSessionWithAccount } from "@/lib/api/session";
import type { Locale } from "@/lib/i18n/config";
import {
  formatBytes,
  formatCurrency,
  formatDate,
  formatDateTime,
} from "@/lib/i18n/formatters";
import { db } from "@/lib/db";
import { invoices, ownerAccounts, plans } from "@/lib/db/schema";
import { SettingsScopeHint } from "../_scope-hint";
import { SettingsTabs } from "../_tabs";

function daysUntil(d: Date): number {
  return Math.ceil((d.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

/**
 * Billing als Settings-Tab (Settings-Redesign Block 2).
 *
 * Single-Page mit zwei Sections übereinander — **keine Sub-Tabs** mehr
 * (Prinzip 5 aus `docs/USER_SETTINGS_DESIGN.md`: Plan-Wechsel ist ein
 * Conversion-Flow → Sub-Route `/settings/billing/plans`, nicht ein
 * Tab).
 *
 * Struktur:
 *   1. PageHeader + SettingsTabs + ScopeHint (wie andere Settings)
 *   2. Plan-Section — Status-KPIs + „Plan wechseln"-Link zu /plans
 *   3. Invoices-Section — Liste mit PDF-Download
 *
 * Die alten drei Sub-Tabs (`/billing`, `/billing/plans`, `/billing/
 * invoices`) werden eingedampft: Overview + Invoices in diese Seite,
 * Plans bleibt als Sub-Route für den Wechsel-Flow.
 */
export default async function SettingsBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ cancelled?: string }>;
}) {
  const { ownerAccountId, accountType } = await requireSessionWithAccount();
  const { cancelled } = await searchParams;
  const locale = (await getLocale()) as Locale;

  const tHeader = await getTranslations("settings.billing.pageHeader");
  const tOverview = await getTranslations("settings.billing.planSection");
  const tInvoices = await getTranslations("settings.billing.invoicesSection");

  const [account, freePlanRow, invoiceRows] = await Promise.all([
    db
      .select()
      .from(ownerAccounts)
      .where(eq(ownerAccounts.id, ownerAccountId))
      .limit(1)
      .then((r) => r[0]),
    db
      .select()
      .from(plans)
      .where(eq(plans.id, "free"))
      .limit(1)
      .then((r) => r[0]),
    db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        description: invoices.description,
        grossCents: invoices.grossCents,
        issuedAt: invoices.issuedAt,
        status: invoices.status,
      })
      .from(invoices)
      .where(eq(invoices.ownerAccountId, ownerAccountId))
      .orderBy(desc(invoices.issuedAt))
      .limit(100),
  ]);

  const now = new Date();
  const expired =
    account?.planExpiresAt && account.planExpiresAt < now ? true : false;
  const effectivePlanId = expired ? "free" : (account?.planId ?? "free");

  let effectivePlan = freePlanRow;
  if (effectivePlanId !== "free") {
    const [row] = await db
      .select()
      .from(plans)
      .where(eq(plans.id, effectivePlanId))
      .limit(1);
    if (row) effectivePlan = row;
  }

  const daysLeft =
    account?.planExpiresAt && !expired
      ? daysUntil(account.planExpiresAt)
      : null;

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

      {cancelled ? (
        <Alert>
          <AlertTitle>{tOverview("cancelled.title")}</AlertTitle>
          <AlertDescription>
            {tOverview("cancelled.description")}
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Plan-Section */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-muted">
                <CreditCard className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <CardTitle className="text-lg font-semibold">
                  {tOverview("currentPlanLabel")}:{" "}
                  <span className="font-mono text-foreground">
                    {effectivePlanId}
                  </span>
                </CardTitle>
                <CardDescription>
                  {effectivePlan
                    ? tOverview("currentPlanDescription", {
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
              render={
                <Link href="/settings/billing/plans">
                  {tOverview("changePlan")}
                </Link>
              }
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <KpiCard
              label={tOverview("kpis.status")}
              value={
                expired
                  ? tOverview("status.expired")
                  : account?.planExpiresAt
                    ? tOverview("status.active")
                    : tOverview("status.free")
              }
              meta={
                expired ? (
                  <Badge variant="outline">{tOverview("status.expired")}</Badge>
                ) : null
              }
            />
            <KpiCard
              label={tOverview("kpis.expiresAt")}
              value={
                account?.planExpiresAt
                  ? formatDateTime(account.planExpiresAt, locale)
                  : tOverview("noExpiry")
              }
              meta={
                daysLeft !== null && !expired
                  ? tOverview("daysLeft", { count: daysLeft })
                  : undefined
              }
            />
            <KpiCard
              label={tOverview("kpis.renewedAt")}
              value={
                account?.planRenewedAt
                  ? formatDateTime(account.planRenewedAt, locale)
                  : "—"
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Upgrade-Hint (Free) + Expired-Hint */}
      {effectivePlanId === "free" ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
            <div>
              <div className="font-medium">{tOverview("upgrade.title")}</div>
              <p className="text-sm text-muted-foreground">
                {tOverview("upgrade.description", {
                  monthly: formatCurrency(490, locale),
                  yearly: formatCurrency(4900, locale),
                })}
              </p>
            </div>
            <Button
              nativeButton={false}
              render={
                <Link href="/settings/billing/plans">
                  {tOverview("upgrade.cta")}
                </Link>
              }
            />
          </CardContent>
        </Card>
      ) : expired ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
            <div className="flex items-start gap-3">
              <Calendar className="mt-0.5 h-5 w-5 text-muted-foreground" />
              <div>
                <div className="font-medium">{tOverview("expired.title")}</div>
                <p className="text-sm text-muted-foreground">
                  {tOverview("expired.description")}
                </p>
              </div>
            </div>
            <Button
              nativeButton={false}
              render={
                <Link href="/settings/billing/plans">
                  {tOverview("expired.cta")}
                </Link>
              }
            />
          </CardContent>
        </Card>
      ) : null}

      {/* Invoices-Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted text-foreground">
              <FileText className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>{tInvoices("title")}</CardTitle>
              <CardDescription>{tInvoices("description")}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {invoiceRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {tInvoices("empty")}
            </p>
          ) : (
            <div className="divide-y rounded-md border">
              {invoiceRows.map((inv) => (
                <div
                  key={inv.id}
                  className="flex flex-col gap-3 px-4 py-3 text-sm md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <code className="font-mono text-xs">
                        {inv.invoiceNumber}
                      </code>
                      <span className="truncate">{inv.description}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        {tInvoices("issuedAtLabel", {
                          date: formatDate(inv.issuedAt, locale),
                        })}
                      </span>
                      <span className="font-mono tabular-nums">
                        {tInvoices("amountLabel", {
                          amount: formatCurrency(inv.grossCents, locale),
                        })}
                      </span>
                      <span>{tInvoices(`status.${inv.status}`)}</span>
                    </div>
                  </div>
                  <a
                    href={`/api/invoices/${inv.id}/pdf`}
                    target="_blank"
                    rel="noopener"
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {tInvoices("download")}
                  </a>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
