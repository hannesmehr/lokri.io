import { desc, eq } from "drizzle-orm";
import { Download, FileText, Lock, User } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { invoices } from "@/lib/db/schema";
import { ChangePasswordDialog } from "./_change-password-dialog";
import { ProfileForm } from "./_profile-form";

function formatCents(c: number): string {
  return (c / 100).toFixed(2).replace(".", ",") + " €";
}

export default async function ProfilePage() {
  const { session, ownerAccountId } = await requireSessionWithAccount();
  const invoiceRows = await db
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
    .limit(50);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-4xl leading-tight">Profil</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Persönliche Daten und Zugangskontrolle deines Accounts.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-indigo-500/15 to-fuchsia-500/15 text-indigo-700 dark:text-indigo-300">
              <User className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>Persönliche Daten</CardTitle>
              <CardDescription>
                Der Name wird dir im Dashboard angezeigt und taucht in
                Export-Manifesten auf.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ProfileForm
            initialName={session.user.name}
            email={session.user.email}
            emailVerified={session.user.emailVerified}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-amber-500/15 to-rose-500/15 text-amber-700 dark:text-amber-400">
                <Lock className="h-4 w-4" />
              </div>
              <div>
                <CardTitle>Passwort</CardTitle>
                <CardDescription>
                  Andere Sessions werden beim Passwort-Wechsel abgemeldet.
                </CardDescription>
              </div>
            </div>
            <ChangePasswordDialog />
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-emerald-500/15 to-teal-500/15 text-emerald-700 dark:text-emerald-400">
              <FileText className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>Rechnungen</CardTitle>
              <CardDescription>
                Alle Zahlungen als PDF-Download.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {invoiceRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Noch keine Rechnungen — du bist auf dem Free-Plan.
            </p>
          ) : (
            <div className="divide-y rounded-md border">
              {invoiceRows.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <code className="font-mono text-xs">
                        {inv.invoiceNumber}
                      </code>
                      <span className="truncate">{inv.description}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(inv.issuedAt).toLocaleDateString("de-DE")} ·{" "}
                      <span className="tabular-nums">
                        {formatCents(inv.grossCents)}
                      </span>{" "}
                      · {inv.status}
                    </div>
                  </div>
                  <a
                    href={`/api/invoices/${inv.id}/pdf`}
                    target="_blank"
                    rel="noopener"
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Download className="h-3.5 w-3.5" />
                    PDF
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
