"use client";

import { Loader2 } from "lucide-react";
import useSWR from "swr";
import { AdminLineChart } from "../../../_charts/admin-charts";
import { formatNumber, formatShortDay } from "../../../_charts/formatters";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const SWR_OPTS = {
  refreshInterval: 60_000,
  revalidateOnFocus: false,
};

interface KpiResponse {
  users: {
    totalUsers: number;
    verifiedUsers: number;
    signupsToday: number;
    signupsThisWeek: number;
    signupsThisMonth: number;
    dauLast30Days: number;
    mauLast30Days: number;
  };
}

type TSR<T> = { type: string; data: T[] };

const fetcher = <T,>(url: string) =>
  fetch(url).then(async (r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as T;
  });

export function UserStatsClient() {
  const { data: kpis } = useSWR<KpiResponse>(
    "/api/admin/stats/kpis",
    fetcher,
    SWR_OPTS,
  );
  const { data: signups } = useSWR<TSR<{ date: string; value: number }>>(
    "/api/admin/stats/timeseries?type=signups&days=90",
    fetcher,
    SWR_OPTS,
  );

  const verifyRate =
    kpis && kpis.users.totalUsers > 0
      ? (kpis.users.verifiedUsers / kpis.users.totalUsers) * 100
      : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        <Mini label="Heute" value={kpis?.users.signupsToday} />
        <Mini label="Diese Woche" value={kpis?.users.signupsThisWeek} />
        <Mini label="Diesen Monat" value={kpis?.users.signupsThisMonth} />
        <Mini
          label="Verifizierungs-Rate"
          value={
            verifyRate != null ? `${verifyRate.toFixed(1)} %` : undefined
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Signups pro Tag</CardTitle>
          <CardDescription>Letzte 90 Tage</CardDescription>
        </CardHeader>
        <CardContent>
          {!signups ? (
            <div className="flex h-[260px] items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <AdminLineChart
              data={signups.data.map((d) => ({
                dateShort: formatShortDay(d.date),
                value: d.value,
              }))}
              xKey="dateShort"
              yKey="value"
              label="Signups"
              formatY={(v) => formatNumber(v)}
              height={260}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">DAU / MAU</CardTitle>
          <CardDescription>
            Session-basiert. DAU = distinct user_ids mit Session in den
            letzten 24 h; MAU in den letzten 30 Tagen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 text-sm sm:grid-cols-2">
            <div className="rounded-md border p-3">
              <div className="text-xs uppercase text-muted-foreground">DAU</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                {kpis ? formatNumber(kpis.users.dauLast30Days) : "—"}
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs uppercase text-muted-foreground">MAU (30d)</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                {kpis ? formatNumber(kpis.users.mauLast30Days) : "—"}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base">Retention-Cohorts</CardTitle>
          <CardDescription>
            Noch nicht verfügbar — wir tracken aktuell nur Session-Create-
            Timestamps; für sauber Cohort-Retention brauchen wir entweder
            regelmäßige Activity-Pings (Heartbeat im Frontend) oder einen
            tieferen Event-Feed pro User. Coming soon.
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
  value: number | string | undefined;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 pt-6">
        <div className="text-xs uppercase text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold tabular-nums">
          {value === undefined
            ? "—"
            : typeof value === "number"
              ? formatNumber(value)
              : value}
        </div>
      </CardContent>
    </Card>
  );
}
