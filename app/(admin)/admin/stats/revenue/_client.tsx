"use client";

import { Download } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import {
  AdminBarChart,
  AdminLineChart,
} from "../../../_charts/admin-charts";
import {
  formatEuro,
  formatEuroCents,
  formatNumber,
  formatShortMonth,
} from "../../../_charts/formatters";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SWR_OPTS = {
  refreshInterval: 60_000,
  revalidateOnFocus: false,
};

interface KpiResponse {
  business: {
    mrrCents: number;
    revenueThisMonthCents: number;
    revenueLastMonthCents: number;
    paidUsersCount: number;
    freeUsersCount: number;
  };
}

type TSR<T> = { type: string; data: T[] };

interface TopRevenue {
  ownerAccountId: string;
  name: string;
  revenueCents: number;
  invoicesCount: number;
}

const fetcher = <T,>(url: string) =>
  fetch(url).then(async (r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as T;
  });

export function RevenueStatsClient() {
  const { data: kpis } = useSWR<KpiResponse>(
    "/api/admin/stats/kpis",
    fetcher,
    SWR_OPTS,
  );
  const { data: mrr } = useSWR<TSR<{ month: string; mrrCents: number }>>(
    "/api/admin/stats/timeseries?type=mrr&months=12",
    fetcher,
    SWR_OPTS,
  );
  const { data: revenue } = useSWR<
    TSR<{ month: string; revenueCents: number }>
  >(
    "/api/admin/stats/timeseries?type=revenue&months=12",
    fetcher,
    SWR_OPTS,
  );
  const { data: top } = useSWR<{ data: TopRevenue[] }>(
    "/api/admin/stats/breakdowns?type=top-revenue&limit=10",
    fetcher,
    SWR_OPTS,
  );

  // Export-Zeitraum
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const defaultFrom = firstOfMonth.toISOString().slice(0, 10);
  const defaultTo = today.toISOString().slice(0, 10);
  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(defaultTo);

  function exportCsv() {
    const from = new Date(fromDate).toISOString();
    const to = new Date(toDate + "T23:59:59").toISOString();
    const url = `/api/admin/stats/revenue-export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&status=paid`;
    window.open(url, "_blank");
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        <Mini
          label="MRR"
          value={kpis ? formatEuro(kpis.business.mrrCents) : undefined}
        />
        <Mini
          label="Diesen Monat"
          value={kpis ? formatEuro(kpis.business.revenueThisMonthCents) : undefined}
        />
        <Mini
          label="Letzten Monat"
          value={kpis ? formatEuro(kpis.business.revenueLastMonthCents) : undefined}
        />
        <Mini
          label="Paid / Free"
          value={
            kpis
              ? `${formatNumber(kpis.business.paidUsersCount)} / ${formatNumber(kpis.business.freeUsersCount)}`
              : undefined
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">MRR-Entwicklung</CardTitle>
            <CardDescription>Letzte 12 Monate</CardDescription>
          </CardHeader>
          <CardContent>
            {mrr ? (
              <AdminLineChart
                data={mrr.data.map((d) => ({
                  month: formatShortMonth(d.month),
                  value: d.mrrCents,
                }))}
                xKey="month"
                yKey="value"
                label="MRR"
                color="hsl(142 71% 45%)"
                formatY={formatEuro}
              />
            ) : (
              <div className="h-[220px]" />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Umsatz pro Monat</CardTitle>
            <CardDescription>Brutto laut bezahlten Invoices</CardDescription>
          </CardHeader>
          <CardContent>
            {revenue ? (
              <AdminBarChart
                data={revenue.data.map((d) => ({
                  month: formatShortMonth(d.month),
                  value: d.revenueCents,
                }))}
                xKey="month"
                yKey="value"
                label="Umsatz"
                color="hsl(271 91% 65%)"
                formatY={formatEuro}
              />
            ) : (
              <div className="h-[220px]" />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Top 10 zahlende Accounts
          </CardTitle>
          <CardDescription>
            Nach kumuliertem Brutto aus bezahlten Invoices.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {top ? (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 text-left">#</th>
                  <th className="py-1 text-left">Account</th>
                  <th className="py-1 text-right">Rechnungen</th>
                  <th className="py-1 text-right">Umsatz</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {top.data.map((t, i) => (
                  <tr key={t.ownerAccountId}>
                    <td className="py-1.5 text-xs text-muted-foreground">
                      {i + 1}
                    </td>
                    <td className="py-1.5">
                      <Link
                        href={`/admin/accounts/${t.ownerAccountId}`}
                        className="hover:underline"
                      >
                        {t.name}
                      </Link>
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-xs">
                      {formatNumber(t.invoicesCount)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {formatEuroCents(t.revenueCents)}
                    </td>
                  </tr>
                ))}
                {top.data.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="py-4 text-center text-muted-foreground"
                    >
                      Noch keine zahlenden Accounts.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">CSV-Export</CardTitle>
          <CardDescription>
            Umsatz-Report für einen wählbaren Zeitraum (Excel-kompatibles
            Format mit UTF-8-BOM).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Von</Label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Bis</Label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
          </div>
          <Button onClick={exportCsv} size="sm">
            <Download className="h-3.5 w-3.5" />
            CSV exportieren
          </Button>
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base">Refund-Rate</CardTitle>
          <CardDescription>
            Nicht verfügbar — aktuell tracken wir nur `status = 'paid'` /
            `'refunded'` / `'failed'` auf Invoices, aber wir haben keine
            historischen Refund-Einträge in der DB (Roadmap-Punkt für das
            PayPal-Refund-Webhook).
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

function Mini({
  label,
  value,
}: {
  label: string;
  value: string | undefined;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 pt-6">
        <div className="text-xs uppercase text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold tabular-nums">
          {value ?? "—"}
        </div>
      </CardContent>
    </Card>
  );
}
