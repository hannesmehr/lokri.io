import { eq } from "drizzle-orm";
import { Download } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "../../../_breadcrumbs";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireAdminSession } from "@/lib/api/session";
import { db } from "@/lib/db";
import { invoices, orders, ownerAccounts, users } from "@/lib/db/schema";

type Params = { params: Promise<{ id: string }> };

function formatCents(c: number): string {
  return (c / 100).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
  });
}

/**
 * Server-gerendertes Detail — Rechnungen sind immutable, kein Grund für
 * SWR-Gymnastik. Nur ein statischer Snapshot mit Links zum Account und
 * PDF-Download.
 */
export default async function AdminInvoiceDetailPage({ params }: Params) {
  await requireAdminSession();
  const { id } = await params;

  const [row] = await db
    .select({
      invoice: invoices,
      accountName: ownerAccounts.name,
      accountType: ownerAccounts.type,
      userEmail: users.email,
      userName: users.name,
      orderStatus: orders.status,
      orderPeriod: orders.period,
      orderPlanId: orders.planId,
      orderStartsAt: orders.startsAt,
      orderExpiresAt: orders.expiresAt,
    })
    .from(invoices)
    .innerJoin(ownerAccounts, eq(ownerAccounts.id, invoices.ownerAccountId))
    .innerJoin(orders, eq(orders.id, invoices.orderId))
    .leftJoin(users, eq(users.id, invoices.userId))
    .where(eq(invoices.id, id))
    .limit(1);
  if (!row) notFound();

  const inv = row.invoice;

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Rechnungen", href: "/admin/invoices" },
          { label: inv.invoiceNumber },
        ]}
      />

      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div className="space-y-1">
            <CardTitle className="font-mono text-xl">
              {inv.invoiceNumber}
            </CardTitle>
            <CardDescription>
              ausgestellt{" "}
              {new Date(inv.issuedAt).toLocaleDateString("de-DE", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            nativeButton={false}
            render={
              <a
                href={`/api/admin/invoices/${inv.id}/pdf`}
                target="_blank"
                rel="noopener"
              />
            }
          >
            <Download className="h-3.5 w-3.5" />
            PDF öffnen
          </Button>
        </CardHeader>
        <CardContent className="grid gap-6 text-sm sm:grid-cols-2">
          <div>
            <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">
              Rechnungsempfänger
            </div>
            <div className="font-medium">{inv.customerName}</div>
            <div className="text-muted-foreground">{inv.customerEmail}</div>
            {row.userEmail && row.userEmail !== inv.customerEmail ? (
              <div className="mt-2 text-xs text-muted-foreground">
                Assoziiert mit User: {row.userEmail}
              </div>
            ) : null}
          </div>
          <div>
            <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">
              Owner-Account
            </div>
            <Link
              href={`/admin/accounts/${inv.ownerAccountId}`}
              className="font-medium hover:underline"
            >
              {row.accountName}
            </Link>
            <div className="text-muted-foreground">
              Typ: {row.accountType === "team" ? "Team" : "Personal"}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Positionen & Beträge</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <tbody className="divide-y">
              <tr>
                <td className="py-2 text-muted-foreground">Beschreibung</td>
                <td className="py-2 text-right">{inv.description}</td>
              </tr>
              <tr>
                <td className="py-2 text-muted-foreground">Netto</td>
                <td className="py-2 text-right tabular-nums">
                  {formatCents(inv.netCents)}
                </td>
              </tr>
              <tr>
                <td className="py-2 text-muted-foreground">
                  USt. ({(inv.taxRateBp / 100).toFixed(0)}%)
                </td>
                <td className="py-2 text-right tabular-nums">
                  {formatCents(inv.taxCents)}
                </td>
              </tr>
              <tr>
                <td className="py-2 font-semibold">Brutto</td>
                <td className="py-2 text-right font-semibold tabular-nums">
                  {formatCents(inv.grossCents)}
                </td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Zugehörige Order</CardTitle>
          <CardDescription>
            Plan, Laufzeit und Zahlungs-ID aus dem Order-Satz.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Plan</dt>
              <dd className="font-medium">{row.orderPlanId}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Periode</dt>
              <dd>{row.orderPeriod}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Order-Status</dt>
              <dd>
                <span className="rounded border bg-muted/40 px-1.5 py-0.5 text-xs">
                  {row.orderStatus}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Zahlungsart</dt>
              <dd>{inv.paymentMethod}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Payment-ID</dt>
              <dd className="font-mono text-xs">{inv.paymentId}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Status (Rechnung)</dt>
              <dd>
                <span className="rounded border bg-muted/40 px-1.5 py-0.5 text-xs">
                  {inv.status}
                </span>
              </dd>
            </div>
            {row.orderStartsAt ? (
              <div>
                <dt className="text-xs text-muted-foreground">Laufzeit-Beginn</dt>
                <dd>
                  {new Date(row.orderStartsAt).toLocaleDateString("de-DE")}
                </dd>
              </div>
            ) : null}
            {row.orderExpiresAt ? (
              <div>
                <dt className="text-xs text-muted-foreground">Laufzeit-Ende</dt>
                <dd>
                  {new Date(row.orderExpiresAt).toLocaleDateString("de-DE")}
                </dd>
              </div>
            ) : null}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
