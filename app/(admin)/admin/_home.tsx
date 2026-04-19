"use client";

import {
  Database,
  Loader2,
  RefreshCw,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import {
  AdminBarChart,
  AdminDualLineChart,
  AdminLineChart,
  AdminPieChart,
} from "../_charts/admin-charts";
import {
  formatBytes,
  formatEuro,
  formatNumber,
  formatRelative,
  formatShortDay,
  formatShortMonth,
} from "../_charts/formatters";
import { AdminKpiTile } from "@/components/admin/admin-kpi-tile";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const KPI_SWR_OPTS = {
  refreshInterval: 60_000,
  revalidateOnFocus: false,
  dedupingInterval: 30_000,
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
  accounts: {
    totalPersonalAccounts: number;
    totalTeamAccounts: number;
    teamAccountsByPlan: Record<string, number>;
    avgSeatsPerTeam: number;
  };
  business: {
    mrrCents: number;
    revenueThisMonthCents: number;
    revenueLastMonthCents: number;
    paidUsersCount: number;
    freeUsersCount: number;
  };
  system: {
    totalBytesStored: number;
    storageByProvider: Record<string, number>;
    totalFiles: number;
    totalNotes: number;
    totalSpaces: number;
  };
  fetchedAt: string;
}

const fetcher = (url: string) =>
  fetch(url).then(async (r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as KpiResponse;
  });

export function AdminDashboardHome() {
  const { data, error, isLoading, mutate } = useSWR<KpiResponse>(
    "/api/admin/stats/kpis",
    fetcher,
    KPI_SWR_OPTS,
  );
  const [refreshing, setRefreshing] = useState(false);

  async function fullRefresh() {
    setRefreshing(true);
    try {
      await fetch("/api/admin/stats/invalidate-cache", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      await mutate();
      toast.success("Daten neu geladen");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        breadcrumbs={[{ label: "Dashboard" }]}
        title="Admin-Dashboard"
        description="KPIs + Charts auf Basis der aktuellen Datenbank. Zahlen werden 60 Sekunden pro Prozess gecatcht — manueller Refresh invalidated den Cache."
        actions={
          <div className="flex flex-col items-end gap-1 text-right">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void fullRefresh()}
              disabled={refreshing || isLoading}
            >
              {refreshing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Aktualisieren
            </Button>
            {data ? (
              <div className="text-[10px] text-muted-foreground">
                Stand: {formatRelative(data.fetchedAt)}
              </div>
            ) : null}
          </div>
        }
      />

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          KPIs konnten nicht geladen werden.
        </div>
      ) : null}

      <KpiGrid data={data} loading={!data && isLoading} />

      <ChartsGrid />
    </div>
  );
}

/* ── KPI-Kacheln ────────────────────────────────────────────────────── */

function KpiGrid({
  data,
  loading,
}: {
  data: KpiResponse | undefined;
  loading: boolean;
}) {
  const usersTotal = data?.users.totalUsers ?? null;
  const usersDelta = data?.users.signupsThisWeek ?? null;
  const teamsTotal = data?.accounts.totalTeamAccounts ?? null;
  const mrrCents = data?.business.mrrCents ?? null;
  const revThis = data?.business.revenueThisMonthCents ?? null;
  const revLast = data?.business.revenueLastMonthCents ?? null;
  const storageTotal = data?.system.totalBytesStored ?? null;

  const revDelta =
    revThis != null && revLast != null
      ? revThis - revLast
      : null;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <AdminKpiTile
        href="/admin/stats/users"
        icon={<Users className="h-4 w-4" />}
        label="User gesamt"
        value={usersTotal == null ? null : formatNumber(usersTotal)}
        delta={usersDelta == null ? undefined : `+${usersDelta} diese Woche`}
        deltaDirection={
          usersDelta != null && usersDelta > 0 ? "up" : "flat"
        }
        loading={loading}
      />
      <AdminKpiTile
        href="/admin/stats/accounts"
        icon={<Wallet className="h-4 w-4" />}
        label="Team-Accounts"
        value={teamsTotal == null ? null : formatNumber(teamsTotal)}
        delta={
          data
            ? `${formatNumber(data.accounts.totalPersonalAccounts)} Personal`
            : undefined
        }
        loading={loading}
      />
      <AdminKpiTile
        href="/admin/stats/revenue"
        icon={<TrendingUp className="h-4 w-4" />}
        label="MRR"
        value={mrrCents == null ? null : formatEuro(mrrCents)}
        delta={
          revDelta == null
            ? undefined
            : `${revDelta >= 0 ? "+" : ""}${formatEuro(Math.abs(revDelta))} zum Vormonat`
        }
        deltaDirection={
          revDelta == null ? "flat" : revDelta >= 0 ? "up" : "down"
        }
        loading={loading}
      />
      <AdminKpiTile
        href="/admin/stats/storage"
        icon={<Database className="h-4 w-4" />}
        label="Storage belegt"
        value={storageTotal == null ? null : formatBytes(storageTotal)}
        delta={
          data
            ? `${formatNumber(data.system.totalFiles)} Files · ${formatNumber(data.system.totalNotes)} Notes`
            : undefined
        }
        loading={loading}
      />
    </div>
  );
}

/* ── Charts-Grid ────────────────────────────────────────────────────── */

interface TimeseriesResponse<T> {
  type: string;
  data: T[];
}

const tsFetcher = <T,>(url: string) =>
  fetch(url).then(async (r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as TimeseriesResponse<T>;
  });

function ChartsGrid() {
  const [signupsDays, setSignupsDays] = useState<30 | 90 | 365>(90);
  const [dauDays, setDauDays] = useState<30 | 90>(30);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SignupsChart days={signupsDays} onDaysChange={setSignupsDays} />
      <MRRChart />
      <AccountsByPlanChart />
      <StorageByProviderChart />
      <DAUMAUChart days={dauDays} onDaysChange={setDauDays} />
      <RevenueChart />
    </div>
  );
}

function ChartCard({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          {description ? (
            <CardDescription className="text-xs">{description}</CardDescription>
          ) : null}
        </div>
        {actions ? (
          <div className="flex items-center gap-1">{actions}</div>
        ) : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function RangeToggle<T extends number>({
  value,
  options,
  onChange,
  suffix = "T",
}: {
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
  suffix?: string;
}) {
  return (
    <div className="flex gap-0.5 rounded-md border p-0.5 text-[10px]">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={
            o === value
              ? "rounded-sm bg-muted px-2 py-0.5 font-medium"
              : "rounded-sm px-2 py-0.5 text-muted-foreground hover:text-foreground"
          }
        >
          {o}
          {suffix}
        </button>
      ))}
    </div>
  );
}

function SignupsChart({
  days,
  onDaysChange,
}: {
  days: 30 | 90 | 365;
  onDaysChange: (v: 30 | 90 | 365) => void;
}) {
  const { data, isLoading, error } = useSWR<
    TimeseriesResponse<{ date: string; value: number }>
  >(
    `/api/admin/stats/timeseries?type=signups&days=${days}`,
    tsFetcher,
    KPI_SWR_OPTS,
  );

  return (
    <ChartCard
      title="Signups"
      description="Neue User pro Tag"
      actions={
        <RangeToggle
          value={days}
          options={[30, 90, 365] as const}
          onChange={onDaysChange}
        />
      }
    >
      <ChartBody error={error} loading={isLoading} empty={data?.data.length === 0}>
        {data ? (
          <AdminLineChart
            data={data.data.map((d) => ({
              ...d,
              dateShort: formatShortDay(d.date),
            }))}
            xKey="dateShort"
            yKey="value"
            label="Signups"
            formatY={(v) => formatNumber(v)}
          />
        ) : null}
      </ChartBody>
    </ChartCard>
  );
}

function MRRChart() {
  const { data, isLoading, error } = useSWR<
    TimeseriesResponse<{ month: string; mrrCents: number }>
  >(
    `/api/admin/stats/timeseries?type=mrr&months=12`,
    tsFetcher,
    KPI_SWR_OPTS,
  );
  return (
    <ChartCard
      title="MRR-Entwicklung"
      description="Letzte 12 Monate (auf Invoice-Basis)"
    >
      <ChartBody error={error} loading={isLoading} empty={data?.data.length === 0}>
        {data ? (
          <AdminLineChart
            data={data.data.map((d) => ({
              month: formatShortMonth(d.month),
              value: d.mrrCents,
            }))}
            xKey="month"
            yKey="value"
            label="MRR"
            color="hsl(142 71% 45%)"
            formatY={(v) => formatEuro(v)}
          />
        ) : null}
      </ChartBody>
    </ChartCard>
  );
}

function AccountsByPlanChart() {
  const { data, isLoading, error } = useSWR<{
    type: string;
    data: Array<{ plan: string; count: number }>;
  }>(
    `/api/admin/stats/breakdowns?type=accounts-by-plan`,
    tsFetcher,
    KPI_SWR_OPTS,
  );
  return (
    <ChartCard
      title="Team-Accounts pro Plan"
      description="Aktuell aktive Team-Accounts"
    >
      <ChartBody error={error} loading={isLoading} empty={data?.data.length === 0}>
        {data ? (
          <AdminBarChart
            data={data.data.map((d) => ({ plan: d.plan, value: d.count }))}
            xKey="plan"
            yKey="value"
            label="Accounts"
            color="hsl(199 89% 48%)"
            formatY={(v) => formatNumber(v)}
          />
        ) : null}
      </ChartBody>
    </ChartCard>
  );
}

function StorageByProviderChart() {
  const { data, isLoading, error } = useSWR<{
    type: string;
    data: Array<{ provider: string; bytes: number }>;
  }>(
    `/api/admin/stats/breakdowns?type=storage-by-provider`,
    tsFetcher,
    KPI_SWR_OPTS,
  );
  return (
    <ChartCard
      title="Storage nach Provider"
      description="Bytes pro Backend (Vercel Blob / S3 / GitHub)"
    >
      <ChartBody error={error} loading={isLoading} empty={data?.data.length === 0}>
        {data ? (
          <AdminPieChart
            data={data.data.map((d) => ({
              name: humanProvider(d.provider),
              bytes: d.bytes,
            }))}
            nameKey="name"
            valueKey="bytes"
            formatValue={formatBytes}
          />
        ) : null}
      </ChartBody>
    </ChartCard>
  );
}

function DAUMAUChart({
  days,
  onDaysChange,
}: {
  days: 30 | 90;
  onDaysChange: (v: 30 | 90) => void;
}) {
  const { data: dau, isLoading, error } = useSWR<
    TimeseriesResponse<{ date: string; value: number }>
  >(
    `/api/admin/stats/timeseries?type=dau&days=${days}`,
    tsFetcher,
    KPI_SWR_OPTS,
  );

  const combined = dau?.data.map((d, i) => {
    // MAU: rollende 30-Tage-Fenster über die DAU-Kurve. Einfache
    // Approximation: letzte 30 Werte summieren → Annäherung an MAU.
    const from = Math.max(0, i - 29);
    const mau = dau.data.slice(from, i + 1).reduce((s, x) => s + x.value, 0);
    return {
      dateShort: formatShortDay(d.date),
      dau: d.value,
      mau30: mau,
    };
  });

  return (
    <ChartCard
      title="DAU / MAU"
      description={`Sessions — DAU einzeln, MAU als 30-Tage-Rollfenster (${days} Tage)`}
      actions={
        <RangeToggle
          value={days}
          options={[30, 90] as const}
          onChange={onDaysChange}
        />
      }
    >
      <ChartBody error={error} loading={isLoading} empty={!combined?.length}>
        {combined ? (
          <AdminDualLineChart
            data={combined}
            xKey="dateShort"
            series={[
              { key: "dau", label: "DAU" },
              { key: "mau30", label: "MAU-30d", color: "hsl(199 89% 48%)" },
            ]}
            formatY={(v) => formatNumber(v)}
          />
        ) : null}
      </ChartBody>
    </ChartCard>
  );
}

function RevenueChart() {
  const { data, isLoading, error } = useSWR<
    TimeseriesResponse<{ month: string; revenueCents: number }>
  >(
    `/api/admin/stats/timeseries?type=revenue&months=12`,
    tsFetcher,
    KPI_SWR_OPTS,
  );
  return (
    <ChartCard
      title="Umsatz pro Monat"
      description="Brutto laut bezahlten Invoices"
    >
      <ChartBody error={error} loading={isLoading} empty={data?.data.length === 0}>
        {data ? (
          <AdminBarChart
            data={data.data.map((d) => ({
              month: formatShortMonth(d.month),
              value: d.revenueCents,
            }))}
            xKey="month"
            yKey="value"
            label="Umsatz"
            color="hsl(271 91% 65%)"
            formatY={(v) => formatEuro(v)}
          />
        ) : null}
      </ChartBody>
    </ChartCard>
  );
}

function ChartBody({
  error,
  loading,
  empty,
  children,
}: {
  error: unknown;
  loading: boolean;
  empty: boolean | undefined;
  children: React.ReactNode;
}) {
  if (error)
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-destructive">
        Daten konnten nicht geladen werden.
      </div>
    );
  if (loading)
    return (
      <div className="flex h-[220px] items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  if (empty)
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
        Noch keine Daten.
      </div>
    );
  return <>{children}</>;
}

function humanProvider(p: string): string {
  switch (p) {
    case "vercel_blob":
      return "Vercel Blob";
    case "s3":
      return "S3 (BYO)";
    case "github":
      return "GitHub";
    default:
      return p;
  }
}
