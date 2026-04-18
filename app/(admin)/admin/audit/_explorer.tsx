"use client";

import { Download, FileJson, Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SWR_OPTS = {
  refreshInterval: 60_000,
  revalidateOnFocus: false,
};

interface EventRow {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  actorUserId: string | null;
  actorEmail: string | null;
  ownerAccountId: string;
  ownerAccountName: string;
  ipAddress: string | null;
  createdAt: string;
}

interface ListResponse {
  events: EventRow[];
  total: number;
  page: number;
  pageSize: number;
}

const fetcher = (url: string) =>
  fetch(url).then(async (r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as ListResponse;
  });

type RangePreset = "1h" | "24h" | "7d" | "30d" | "custom";

function presetRange(preset: RangePreset): { from?: string; to?: string } {
  const now = new Date();
  const iso = (d: Date) => d.toISOString();
  if (preset === "1h")
    return { from: iso(new Date(now.getTime() - 60 * 60 * 1000)), to: iso(now) };
  if (preset === "24h")
    return { from: iso(new Date(now.getTime() - 24 * 60 * 60 * 1000)), to: iso(now) };
  if (preset === "7d")
    return {
      from: iso(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)),
      to: iso(now),
    };
  if (preset === "30d")
    return {
      from: iso(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)),
      to: iso(now),
    };
  return {};
}

export function AuditExplorer() {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [action, setAction] = useState("");
  const [actorUserId, setActorUserId] = useState("");
  const [ownerAccountId, setOwnerAccountId] = useState("");
  const [preset, setPreset] = useState<RangePreset>("7d");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  // Presets überschreiben das Custom-Paar; Custom-Preset heißt, dass die
  // Date-Inputs direkt gelten.
  const rangeParams = useMemo(() => {
    if (preset !== "custom") return presetRange(preset);
    const from = fromDate ? new Date(fromDate).toISOString() : undefined;
    const to = toDate ? new Date(toDate + "T23:59:59").toISOString() : undefined;
    return { from, to };
  }, [preset, fromDate, toDate]);

  const params = new URLSearchParams();
  if (debouncedQ) params.set("q", debouncedQ);
  if (action) params.set("action", action);
  if (actorUserId) params.set("actorUserId", actorUserId);
  if (ownerAccountId) params.set("ownerAccountId", ownerAccountId);
  if (rangeParams.from) params.set("from", rangeParams.from);
  if (rangeParams.to) params.set("to", rangeParams.to);
  params.set("page", String(page));
  const listUrl = `/api/admin/audit?${params.toString()}`;

  const { data, error, isLoading, mutate } = useSWR<ListResponse>(
    listUrl,
    fetcher,
    SWR_OPTS,
  );
  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const { data: actionsData } = useSWR<{ actions: string[] }>(
    "/api/admin/audit/actions",
    (url) => fetch(url).then((r) => r.json()),
    { refreshInterval: 300_000, revalidateOnFocus: false },
  );

  function exportUrl(format: "csv" | "json"): string {
    const p = new URLSearchParams(params);
    p.delete("page");
    p.set("format", format);
    p.set("limit", "10000");
    return `/api/admin/audit/export?${p.toString()}`;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Suche: Action, Target-ID, Actor-Email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-sm"
        />
        <select
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-md border bg-background px-2 text-xs"
        >
          <option value="">Alle Actions</option>
          {actionsData?.actions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <Input
          placeholder="Actor-UserID"
          value={actorUserId}
          onChange={(e) => {
            setActorUserId(e.target.value.trim());
            setPage(1);
          }}
          className="max-w-[180px] font-mono text-xs"
        />
        <Input
          placeholder="Account-UUID"
          value={ownerAccountId}
          onChange={(e) => {
            setOwnerAccountId(e.target.value.trim());
            setPage(1);
          }}
          className="max-w-[240px] font-mono text-xs"
        />
        <select
          value={preset}
          onChange={(e) => {
            setPreset(e.target.value as RangePreset);
            setPage(1);
          }}
          className="h-9 rounded-md border bg-background px-2 text-xs"
        >
          <option value="1h">Letzte Stunde</option>
          <option value="24h">Letzte 24h</option>
          <option value="7d">Letzte 7 Tage</option>
          <option value="30d">Letzte 30 Tage</option>
          <option value="custom">Custom</option>
        </select>
        {preset === "custom" ? (
          <>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(1);
              }}
              className="max-w-[150px]"
            />
            <Input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(1);
              }}
              className="max-w-[150px]"
            />
          </>
        ) : null}
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
        <a
          href={exportUrl("csv")}
          target="_blank"
          rel="noopener"
          className="inline-flex h-9 items-center gap-1 rounded-md border bg-background px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Download className="h-3.5 w-3.5" />
          CSV
        </a>
        <a
          href={exportUrl("json")}
          target="_blank"
          rel="noopener"
          className="inline-flex h-9 items-center gap-1 rounded-md border bg-background px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <FileJson className="h-3.5 w-3.5" />
          JSON
        </a>
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
              <th className="px-3 py-2 text-left">Zeit</th>
              <th className="px-3 py-2 text-left">Action</th>
              <th className="px-3 py-2 text-left">Actor</th>
              <th className="px-3 py-2 text-left">Account</th>
              <th className="px-3 py-2 text-left">Target</th>
              <th className="px-3 py-2 text-left">IP</th>
              <th className="px-3 py-2 text-left"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data?.events.map((e) => (
              <tr key={e.id} className="hover:bg-muted/30">
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {new Date(e.createdAt).toLocaleString("de-DE", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </td>
                <td className="px-3 py-2">
                  <ActionBadge action={e.action} />
                </td>
                <td className="px-3 py-2 text-xs">
                  {e.actorEmail ? (
                    <Link
                      href={`/admin/users/${e.actorUserId}`}
                      className="hover:underline"
                    >
                      {e.actorEmail}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">system</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs">
                  <Link
                    href={`/admin/accounts/${e.ownerAccountId}`}
                    className="hover:underline"
                  >
                    {e.ownerAccountName}
                  </Link>
                </td>
                <td className="px-3 py-2 text-xs">
                  {e.targetType ? (
                    <span className="text-muted-foreground">
                      {e.targetType}
                      {e.targetId ? `/${e.targetId.slice(0, 8)}` : ""}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-[10px] text-muted-foreground">
                  {e.ipAddress ?? "—"}
                </td>
                <td className="px-3 py-2">
                  <Link
                    href={`/admin/audit/${e.id}`}
                    className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    Detail →
                  </Link>
                </td>
              </tr>
            ))}
            {!data && !error && isLoading ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                </td>
              </tr>
            ) : null}
            {data && data.events.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  Keine Events gefunden.
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

function ActionBadge({ action }: { action: string }) {
  const isAdmin = action.startsWith("admin.");
  const isLogin = action.startsWith("login.");
  const cls = isAdmin
    ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200"
    : isLogin
      ? "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300"
      : "bg-muted/40 text-muted-foreground";
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 font-mono text-[10px] ${cls}`}
    >
      {action}
    </span>
  );
}
