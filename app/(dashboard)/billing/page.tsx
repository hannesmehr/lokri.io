import { eq } from "drizzle-orm";
import { Calendar, Sparkles } from "lucide-react";
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
import { requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { ownerAccounts, plans } from "@/lib/db/schema";
import { formatBytes, formatDateTime } from "@/lib/format";

function formatCents(c: number): string {
  return (c / 100).toFixed(2).replace(".", ",") + " €";
}

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
          <AlertTitle>Bestellung abgebrochen</AlertTitle>
          <AlertDescription>
            Du wurdest von PayPal ohne Zahlung zurückgeleitet. Dein Plan ist
            unverändert.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card className="overflow-hidden border-indigo-500/20 bg-gradient-to-br from-indigo-500/5 via-background to-fuchsia-500/5">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-br from-indigo-500/15 to-fuchsia-500/15 text-indigo-700 dark:text-indigo-300">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="font-display text-2xl font-normal">
                  Aktueller Plan:{" "}
                  <span className="italic text-brand">
                    {effectivePlan?.name ?? "Free"}
                  </span>
                </CardTitle>
                <CardDescription>
                  {effectivePlan
                    ? `${formatBytes(effectivePlan.maxBytes)} Speicher · ${effectivePlan.maxFiles.toLocaleString("de-DE")} Files · ${effectivePlan.maxNotes.toLocaleString("de-DE")} Notes`
                    : null}
                </CardDescription>
              </div>
            </div>
            <Button
              nativeButton={false}
              render={<Link href="/billing/plans">Plan ändern →</Link>}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat
              label="Status"
              value={
                expired ? (
                  <Badge
                    variant="secondary"
                    className="bg-red-500/10 text-red-700 dark:text-red-300"
                  >
                    abgelaufen
                  </Badge>
                ) : account?.planExpiresAt ? (
                  <Badge variant="secondary">aktiv</Badge>
                ) : (
                  <Badge variant="secondary">Free</Badge>
                )
              }
            />
            <Stat
              label="Läuft bis"
              value={
                account?.planExpiresAt ? (
                  <span>
                    {formatDateTime(account.planExpiresAt)}
                    {daysLeft !== null && !expired ? (
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({daysLeft} Tage)
                      </span>
                    ) : null}
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    Keine Ablaufzeit
                  </span>
                )
              }
            />
            <Stat
              label="Zuletzt verlängert"
              value={
                account?.planRenewedAt ? (
                  formatDateTime(account.planRenewedAt)
                ) : (
                  <span className="text-muted-foreground">—</span>
                )
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* CTA card */}
      {effectivePlanId === "free" ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
            <div>
              <div className="font-medium">Mehr Speicher gefällig?</div>
              <p className="text-sm text-muted-foreground">
                Starter ab <span className="tabular-nums">4,90 €</span>/Monat
                oder <span className="tabular-nums">49 €</span>/Jahr.
              </p>
            </div>
            <Button
              nativeButton={false}
              render={<Link href="/billing/plans">Plans ansehen</Link>}
            />
          </CardContent>
        </Card>
      ) : expired ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
            <div className="flex items-start gap-3">
              <Calendar className="mt-0.5 h-5 w-5 text-amber-600" />
              <div>
                <div className="font-medium">Dein Plan ist abgelaufen</div>
                <p className="text-sm text-muted-foreground">
                  Du nutzt aktuell nur Free-Limits. Bestehende Daten bleiben
                  erhalten — verlängere, um wieder das volle Kontingent zu
                  bekommen.
                </p>
              </div>
            </div>
            <Button
              nativeButton={false}
              render={<Link href="/billing/plans">Verlängern</Link>}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card/60 p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm">{value}</div>
    </div>
  );
}
