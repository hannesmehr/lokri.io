"use client";

import Link from "next/link";
import useSWR from "swr";
import { AdminBarChart } from "../../../_charts/admin-charts";
import { formatNumber } from "../../../_charts/formatters";
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
  accounts: {
    totalPersonalAccounts: number;
    totalTeamAccounts: number;
    teamAccountsByPlan: Record<string, number>;
    avgSeatsPerTeam: number;
  };
}

interface TopTeam {
  ownerAccountId: string;
  name: string;
  seats: number;
  planId: string;
}

const fetcher = <T,>(url: string) =>
  fetch(url).then(async (r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as T;
  });

export function AccountStatsClient() {
  const { data: kpis } = useSWR<KpiResponse>(
    "/api/admin/stats/kpis",
    fetcher,
    SWR_OPTS,
  );
  const { data: topTeams } = useSWR<{ data: TopTeam[] }>(
    "/api/admin/stats/top-teams?limit=20",
    fetcher,
    SWR_OPTS,
  );

  // Seat-Histogram-Buckets: 1, 2, 3, 5, 10, 20+
  const seatBuckets = (() => {
    if (!topTeams) return [];
    // Wir haben nur die Top-N aus `topTeams`; für eine echte Verteilung
    // würden wir eine eigene Aggregation brauchen. Als Sanity-Check
    // reicht hier die Verteilung über die Top-20.
    const b = [
      { label: "1", max: 1, n: 0 },
      { label: "2", max: 2, n: 0 },
      { label: "3-4", max: 4, n: 0 },
      { label: "5-9", max: 9, n: 0 },
      { label: "10-19", max: 19, n: 0 },
      { label: "20+", max: Infinity, n: 0 },
    ];
    for (const t of topTeams.data) {
      const bucket = b.find((x) => t.seats <= x.max);
      if (bucket) bucket.n++;
    }
    return b.map((x) => ({ label: x.label, value: x.n }));
  })();

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Mini
          label="Personal-Accounts"
          value={kpis?.accounts.totalPersonalAccounts}
        />
        <Mini
          label="Team-Accounts"
          value={kpis?.accounts.totalTeamAccounts}
        />
        <Mini
          label="Ø Seats pro Team"
          value={
            kpis ? kpis.accounts.avgSeatsPerTeam.toFixed(1) : undefined
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Team-Accounts pro Plan</CardTitle>
            <CardDescription>Aktuelle Plan-Verteilung</CardDescription>
          </CardHeader>
          <CardContent>
            {kpis ? (
              <AdminBarChart
                data={Object.entries(kpis.accounts.teamAccountsByPlan).map(
                  ([plan, count]) => ({ plan, value: count }),
                )}
                xKey="plan"
                yKey="value"
                label="Accounts"
                color="hsl(199 89% 48%)"
                formatY={formatNumber}
              />
            ) : (
              <div className="h-[220px]" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Seat-Verteilung (Top 20)
            </CardTitle>
            <CardDescription>
              Wie viele der größten Teams fallen in welchen Seat-Bucket.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {topTeams ? (
              <AdminBarChart
                data={seatBuckets}
                xKey="label"
                yKey="value"
                label="Teams"
                color="hsl(38 92% 50%)"
                formatY={formatNumber}
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
            Größte Teams (nach Seat-Count)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {topTeams ? (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 text-left">#</th>
                  <th className="py-1 text-left">Name</th>
                  <th className="py-1 text-left">Plan</th>
                  <th className="py-1 text-right">Seats</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {topTeams.data.map((t, i) => (
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
                    <td className="py-1.5 text-xs text-muted-foreground">
                      {t.planId}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {formatNumber(t.seats)}
                    </td>
                  </tr>
                ))}
                {topTeams.data.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="py-4 text-center text-muted-foreground"
                    >
                      Noch keine Teams.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          ) : null}
        </CardContent>
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
