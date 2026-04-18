import { desc, eq } from "drizzle-orm";
import { Download, FileText } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
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
import type { Locale } from "@/lib/i18n/config";
import { formatCurrency, formatDate } from "@/lib/i18n/formatters";

export default async function BillingInvoicesPage() {
  const { ownerAccountId } = await requireSessionWithAccount();
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("billing.invoices");
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
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted text-foreground">
            <FileText className="h-4 w-4" />
          </div>
          <div>
            <CardTitle>{t("title")}</CardTitle>
            <CardDescription>{t("description")}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="divide-y rounded-md border">
            {rows.map((inv) => (
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
                    <span>{t("issuedAtLabel", { date: formatDate(inv.issuedAt, locale) })}</span>
                    <span className="font-mono tabular-nums">
                      {t("amountLabel", { amount: formatCurrency(inv.grossCents, locale) })}
                    </span>
                    <span>{t(`status.${inv.status}`)}</span>
                  </div>
                </div>
                <a
                  href={`/api/invoices/${inv.id}/pdf`}
                  target="_blank"
                  rel="noopener"
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Download className="h-3.5 w-3.5" />
                  {t("download")}
                </a>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
