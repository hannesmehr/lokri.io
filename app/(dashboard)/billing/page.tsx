import { asc, eq } from "drizzle-orm";
import { Check, Sparkles } from "lucide-react";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { ownerAccounts, plans } from "@/lib/db/schema";
import { UpgradeButton } from "./_upgrade-button";

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}

function formatBytes(n: number): string {
  if (n >= 1024 * 1024 * 1024)
    return `${(n / 1024 / 1024 / 1024).toFixed(0)} GB`;
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(0)} MB`;
  return `${(n / 1024).toFixed(0)} KB`;
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ cancelled?: string }>;
}) {
  const { ownerAccountId } = await requireSessionWithAccount();
  const { cancelled } = await searchParams;

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
  const expired = account?.planExpiresAt && account.planExpiresAt < now;
  const currentPlanId = expired ? "free" : (account?.planId ?? "free");
  const currentPlan = allPlans.find((p) => p.id === currentPlanId);

  const purchasable = allPlans.filter((p) => p.isPurchasable);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-4xl leading-tight">Billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upgrade auf mehr Speicher. Jahres-Abos ~2 Monate günstiger als
          monatliche Buchung.
        </p>
      </div>

      {cancelled ? (
        <Alert>
          <AlertTitle>Bestellung abgebrochen</AlertTitle>
          <AlertDescription>
            Du wurdest von PayPal ohne Zahlung zurückgeleitet. Dein Plan ist
            unverändert.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Current plan banner */}
      <Card className="overflow-hidden border-indigo-500/20 bg-gradient-to-br from-indigo-500/5 via-background to-fuchsia-500/5">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-indigo-500/15 to-fuchsia-500/15 text-indigo-700 dark:text-indigo-300">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <CardTitle>
                  Aktueller Plan:{" "}
                  <span className="font-display italic text-brand">
                    {currentPlan?.name ?? "Free"}
                  </span>
                </CardTitle>
                <CardDescription>
                  {currentPlan
                    ? `${formatBytes(currentPlan.maxBytes)} Speicher · ${currentPlan.maxFiles.toLocaleString("de-DE")} Files · ${currentPlan.maxNotes.toLocaleString("de-DE")} Notes`
                    : null}
                </CardDescription>
              </div>
            </div>
            {account?.planExpiresAt ? (
              <Badge variant="secondary" className={expired ? "bg-red-500/10 text-red-700 dark:text-red-300" : ""}>
                {expired ? "abgelaufen am " : "gültig bis "}
                {new Date(account.planExpiresAt).toLocaleDateString("de-DE")}
              </Badge>
            ) : null}
          </div>
        </CardHeader>
      </Card>

      {/* Plan grid */}
      <div className="grid gap-4 md:grid-cols-3">
        {purchasable.map((plan) => {
          const isCurrent = plan.id === currentPlanId;
          const yearlyMonthly = plan.priceYearlyCents / 12;
          const yearlySavingsPct = Math.round(
            (1 - plan.priceYearlyCents / 12 / plan.priceMonthlyCents) * 100,
          );
          return (
            <Card
              key={plan.id}
              className={
                plan.id === "pro"
                  ? "relative overflow-hidden border-indigo-500/30 shadow-lg"
                  : "relative overflow-hidden"
              }
            >
              {plan.id === "pro" ? (
                <div className="absolute right-3 top-3">
                  <Badge>Empfohlen</Badge>
                </div>
              ) : null}
              <CardHeader>
                <CardTitle className="font-display text-2xl font-normal">
                  {plan.name}
                </CardTitle>
                <CardDescription className="min-h-[2.5rem]">
                  {plan.description}
                </CardDescription>
                <div className="pt-3">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-semibold tabular-nums">
                      {formatCents(plan.priceMonthlyCents)}
                    </span>
                    <span className="text-sm text-muted-foreground">/Monat</span>
                  </div>
                  {plan.priceYearlyCents > 0 ? (
                    <div className="mt-1 text-xs text-muted-foreground">
                      oder{" "}
                      <strong className="text-foreground tabular-nums">
                        {formatCents(plan.priceYearlyCents)}
                      </strong>
                      /Jahr ({formatCents(Math.round(yearlyMonthly))}
                      /Monat, {yearlySavingsPct}% gespart)
                    </div>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-1.5 text-sm">
                  <Feature>
                    <strong className="tabular-nums">
                      {formatBytes(plan.maxBytes)}
                    </strong>{" "}
                    Speicher
                  </Feature>
                  <Feature>
                    {plan.maxFiles.toLocaleString("de-DE")} Files
                  </Feature>
                  <Feature>
                    {plan.maxNotes.toLocaleString("de-DE")} Notes
                  </Feature>
                  <Feature>Semantische Suche &amp; MCP-Zugriff</Feature>
                  <Feature>Keine Werbung, keine Trainingsnutzung</Feature>
                </ul>
                {isCurrent ? (
                  <div className="rounded-md border bg-muted/40 p-2 text-center text-xs text-muted-foreground">
                    Dein aktueller Plan
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 pt-2">
                    <UpgradeButton
                      planId={plan.id}
                      period="yearly"
                      label={`Jährlich buchen · ${formatCents(plan.priceYearlyCents)}`}
                      className="w-full"
                    />
                    <UpgradeButton
                      planId={plan.id}
                      period="monthly"
                      label={`Monatlich · ${formatCents(plan.priceMonthlyCents)}`}
                      className="w-full"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Zahlungsabwicklung über PayPal. One-time-Captures, kein Auto-Renewal
        — du musst vor Ablauf aktiv verlängern. Rechnungen landen unter{" "}
        <Link href="/profile" className="underline-offset-4 hover:underline">
          /profile
        </Link>
        .
      </p>
    </div>
  );
}

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
      <span>{children}</span>
    </li>
  );
}
