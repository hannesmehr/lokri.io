import { desc, eq } from "drizzle-orm";
import { Download, FileText } from "lucide-react";
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

function formatCents(c: number): string {
  return (c / 100).toFixed(2).replace(".", ",") + " €";
}

export default async function BillingInvoicesPage() {
  const { ownerAccountId } = await requireSessionWithAccount();
  const rows = await db
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
    .limit(100);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-emerald-500/15 to-teal-500/15 text-emerald-700 dark:text-emerald-400">
            <FileText className="h-4 w-4" />
          </div>
          <div>
            <CardTitle>Rechnungen</CardTitle>
            <CardDescription>
              PDF-Download aller bisherigen Zahlungen. Die Rechnungsnummern
              werden fortlaufend vergeben und folgen dem Format{" "}
              <code>LK-YYYY-NNNN</code>.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Noch keine Rechnungen — du bist auf dem Free-Plan.
          </p>
        ) : (
          <div className="divide-y rounded-md border">
            {rows.map((inv) => (
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
  );
}
