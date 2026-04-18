"use client";

import { Loader2, RefreshCw, Users as UsersIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SWR_OPTS = {
  refreshInterval: 60_000,
  revalidateOnFocus: false,
  dedupingInterval: 30_000,
};

interface AccountRow {
  id: string;
  name: string;
  type: "personal" | "team";
  planId: string;
  planName: string;
  planExpiresAt: string | null;
  createdAt: string;
  memberCount: number;
  usedBytes: number;
  quotaOverride: { bytes?: number; files?: number; notes?: number } | null;
}

interface ListResponse {
  accounts: AccountRow[];
  total: number;
  page: number;
  pageSize: number;
}

const fetcher = (url: string) =>
  fetch(url).then(async (r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as ListResponse;
  });

export function AccountsExplorer() {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [type, setType] = useState<"" | "personal" | "team">("");
  const [planId, setPlanId] = useState("");
  const [sort, setSort] = useState<"created" | "name" | "usage">("created");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const params = new URLSearchParams();
  if (debouncedQ) params.set("q", debouncedQ);
  if (type) params.set("type", type);
  if (planId) params.set("planId", planId);
  params.set("sort", sort);
  params.set("page", String(page));
  const url = `/api/admin/accounts?${params.toString()}`;

  const { data, error, isLoading, mutate } = useSWR<ListResponse>(
    url,
    fetcher,
    SWR_OPTS,
  );

  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Suche nach Account-Name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-sm"
          autoComplete="off"
        />
        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value as typeof type);
            setPage(1);
          }}
          className="h-9 rounded-md border bg-background px-2 text-xs"
        >
          <option value="">Alle Typen</option>
          <option value="personal">Personal</option>
          <option value="team">Team</option>
        </select>
        <Input
          placeholder="Plan-ID (z.B. pro)"
          value={planId}
          onChange={(e) => {
            setPlanId(e.target.value);
            setPage(1);
          }}
          className="max-w-[160px]"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          className="h-9 rounded-md border bg-background px-2 text-xs"
        >
          <option value="created">Erstellt</option>
          <option value="name">Name</option>
          <option value="usage">Storage-Verbrauch</option>
        </select>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void mutate()}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Aktualisieren
        </Button>
        <div className="ml-auto text-xs text-muted-foreground">
          {data ? `${data.total} gesamt` : "…"}
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          Liste konnte nicht geladen werden.
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Typ</th>
              <th className="px-3 py-2 text-left">Plan</th>
              <th className="px-3 py-2 text-left">Ablauf</th>
              <th className="px-3 py-2 text-left">Member</th>
              <th className="px-3 py-2 text-right">Storage</th>
              <th className="px-3 py-2 text-left">Override</th>
              <th className="px-3 py-2 text-left">Erstellt</th>
              <th className="px-3 py-2 text-left">Aktionen</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data?.accounts.map((a) => (
              <tr key={a.id}>
                <td className="px-3 py-2">
                  <div className="font-medium">{a.name}</div>
                  <div className="text-[10px] text-muted-foreground">{a.id}</div>
                </td>
                <td className="px-3 py-2">
                  <span
                    className={
                      a.type === "team"
                        ? "rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-300"
                        : "rounded border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    }
                  >
                    {a.type === "team" ? "Team" : "Personal"}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="text-xs">{a.planName}</div>
                  <div className="text-[10px] text-muted-foreground">{a.planId}</div>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {a.planExpiresAt
                    ? new Date(a.planExpiresAt).toLocaleDateString("de-DE")
                    : "—"}
                </td>
                <td className="px-3 py-2">
                  <div className="inline-flex items-center gap-1 tabular-nums text-xs">
                    <UsersIcon className="h-3 w-3 text-muted-foreground" />
                    {a.memberCount}
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-xs">
                  {formatBytes(a.usedBytes)}
                </td>
                <td className="px-3 py-2">
                  {a.quotaOverride ? (
                    <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-200">
                      Override
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {new Date(a.createdAt).toLocaleDateString("de-DE")}
                </td>
                <td className="px-3 py-2">
                  <Button
                    size="sm"
                    variant="outline"
                    nativeButton={false}
                    render={<Link href={`/admin/accounts/${a.id}`} />}
                  >
                    Öffnen
                  </Button>
                </td>
              </tr>
            ))}
            {!data && !error && isLoading ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                </td>
              </tr>
            ) : null}
            {data && data.accounts.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  Keine Accounts gefunden.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {data && pageCount > 1 ? (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <Button
            size="sm"
            variant="ghost"
            disabled={page === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ← Zurück
          </Button>
          <span>
            Seite {page} / {pageCount}
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={page >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
          >
            Weiter →
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exp = Math.min(
    Math.floor(Math.log(n) / Math.log(1024)),
    units.length - 1,
  );
  const value = n / Math.pow(1024, exp);
  return `${value.toLocaleString("de-DE", { maximumFractionDigits: value >= 10 || exp === 0 ? 0 : 1 })} ${units[exp]}`;
}
