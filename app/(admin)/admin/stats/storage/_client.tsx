"use client";

import Link from "next/link";
import useSWR from "swr";
import { AdminPieChart } from "../../../_charts/admin-charts";
import { formatBytes, formatNumber } from "../../../_charts/formatters";
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
  system: {
    totalBytesStored: number;
    storageByProvider: Record<string, number>;
    totalFiles: number;
    totalNotes: number;
    totalSpaces: number;
  };
}

interface TopAccount {
  ownerAccountId: string;
  name: string;
  usedBytes: number;
}

const fetcher = <T,>(url: string) =>
  fetch(url).then(async (r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as T;
  });

export function StorageStatsClient() {
  const { data: kpis } = useSWR<KpiResponse>(
    "/api/admin/stats/kpis",
    fetcher,
    SWR_OPTS,
  );
  const { data: top } = useSWR<{ data: TopAccount[] }>(
    "/api/admin/stats/breakdowns?type=top-storage&limit=10",
    fetcher,
    SWR_OPTS,
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        <Mini
          label="Gesamt"
          value={
            kpis ? formatBytes(kpis.system.totalBytesStored) : undefined
          }
        />
        <Mini
          label="Files"
          value={kpis ? formatNumber(kpis.system.totalFiles) : undefined}
        />
        <Mini
          label="Notes"
          value={kpis ? formatNumber(kpis.system.totalNotes) : undefined}
        />
        <Mini
          label="Spaces"
          value={kpis ? formatNumber(kpis.system.totalSpaces) : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Storage nach Provider</CardTitle>
            <CardDescription>Bytes pro Backend</CardDescription>
          </CardHeader>
          <CardContent>
            {kpis ? (
              <AdminPieChart
                data={Object.entries(kpis.system.storageByProvider).map(
                  ([provider, bytes]) => ({
                    name: humanProvider(provider),
                    bytes,
                  }),
                )}
                nameKey="name"
                valueKey="bytes"
                formatValue={formatBytes}
              />
            ) : (
              <div className="h-[220px]" />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Provider-Details</CardTitle>
            <CardDescription>
              Aufschlüsselung in Tabellenform.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {kpis ? (
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1 text-left">Provider</th>
                    <th className="py-1 text-right">Bytes</th>
                    <th className="py-1 text-right">Anteil</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {Object.entries(kpis.system.storageByProvider).map(
                    ([p, b]) => {
                      const pct =
                        kpis.system.totalBytesStored > 0
                          ? (b / kpis.system.totalBytesStored) * 100
                          : 0;
                      return (
                        <tr key={p}>
                          <td className="py-1.5">{humanProvider(p)}</td>
                          <td className="py-1.5 text-right tabular-nums">
                            {formatBytes(b)}
                          </td>
                          <td className="py-1.5 text-right tabular-nums text-xs text-muted-foreground">
                            {pct.toFixed(1)} %
                          </td>
                        </tr>
                      );
                    },
                  )}
                </tbody>
              </table>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Top 10 Accounts nach Storage
          </CardTitle>
        </CardHeader>
        <CardContent>
          {top ? (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 text-left">#</th>
                  <th className="py-1 text-left">Account</th>
                  <th className="py-1 text-right">Belegt</th>
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
                    <td className="py-1.5 text-right tabular-nums">
                      {formatBytes(t.usedBytes)}
                    </td>
                  </tr>
                ))}
                {top.data.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="py-4 text-center text-muted-foreground"
                    >
                      Noch keine Daten.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base">Quota-Auslastungs-Heatmap</CardTitle>
          <CardDescription>
            Noch nicht verfügbar — wir müssten dafür pro Account
            `used_bytes / plan.max_bytes` berechnen (plus Seat-Scaling).
            Coming soon.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
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
