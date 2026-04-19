"use client";

import { Database, Loader2, Play, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { formatBytes, formatNumber } from "../../_charts/formatters";
import { AdminHealthTile } from "@/components/admin/admin-health-tile";
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

interface HealthResponse {
  paypal: {
    staleCreated: number;
    failed: number;
    capturedWithoutInvoice: number;
  };
  storage: { providersTotal: number };
  embedding: { byokKeysTotal: number };
  sessions: { expired: number };
  invites: { stale: number };
  users: { missingLocale: number };
  tokens: { activeTotal: number };
  fetchedAt: string;
}

interface DbMetricsResponse {
  tables: Array<{
    table: string;
    totalBytes: number;
    approxRows: number;
  }>;
}

const fetcher = <T,>(url: string) =>
  fetch(url).then(async (r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as T;
  });

export function SystemHealthClient() {
  const {
    data: health,
    error,
    isLoading,
    mutate,
  } = useSWR<HealthResponse>(
    "/api/admin/system/health",
    fetcher,
    SWR_OPTS,
  );
  const { data: db } = useSWR<DbMetricsResponse>(
    "/api/admin/system/db-metrics",
    fetcher,
    SWR_OPTS,
  );

  const [reconcileLoading, setReconcileLoading] = useState(false);

  async function runReconcile() {
    if (!confirm("PayPal-Reconcile jetzt ausführen?")) return;
    setReconcileLoading(true);
    try {
      const res = await fetch("/api/admin/system/reconcile-paypal", {
        method: "POST",
      });
      const body = (await res.json()) as {
        ok?: boolean;
        repaired?: number;
        failed?: number;
        totalCaptured?: number;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        toast.error(body.error ?? "Reconcile fehlgeschlagen.");
        return;
      }
      toast.success(
        `Reconcile: ${body.repaired} repariert, ${body.failed} Fehler (von ${body.totalCaptured}).`,
      );
      await mutate();
    } finally {
      setReconcileLoading(false);
    }
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Health-Daten konnten nicht geladen werden.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2">
        <Button
          size="sm"
          variant="outline"
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
      </div>

      {/* Sektion A: PayPal */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">PayPal-Reconcile</CardTitle>
          <CardDescription>
            Zustand der Orders + Invoices. Reconcile repariert fehlende
            Invoice-Einträge zu bereits captureten Orders.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <AdminHealthTile
              label="Hängende Orders (> 1 h alt)"
              value={
                health
                  ? formatNumber(health.paypal.staleCreated)
                  : undefined
              }
              warn={(health?.paypal.staleCreated ?? 0) > 0}
            />
            <AdminHealthTile
              label="Fehlerhafte Orders"
              value={
                health ? formatNumber(health.paypal.failed) : undefined
              }
              warn={(health?.paypal.failed ?? 0) > 0}
            />
            <AdminHealthTile
              label="Captured ohne Invoice"
              value={
                health
                  ? formatNumber(health.paypal.capturedWithoutInvoice)
                  : undefined
              }
              warn={(health?.paypal.capturedWithoutInvoice ?? 0) > 0}
            />
          </div>
          <Button
            size="sm"
            onClick={() => void runReconcile()}
            disabled={reconcileLoading}
          >
            {reconcileLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            Reconcile jetzt ausführen
          </Button>
        </CardContent>
      </Card>

      {/* Sektion B: Storage + Embedding + Tokens */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Storage-Provider</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums">
              {health ? formatNumber(health.storage.providersTotal) : "—"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              BYO-S3/GitHub-Integrationen. Vercel Blob ist implizit und
              nicht mitgezählt. Connection-Check nur per-Request (Provider-
              Detail-Seite pro Account).
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Embedding-Keys</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums">
              {health ? formatNumber(health.embedding.byokKeysTotal) : "—"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              BYO-Keys. Der Rest läuft über die Vercel AI Gateway.
              Fehler-Rate wird aktuell nicht getrackt (Roadmap).
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aktive API-Tokens</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums">
              {health ? formatNumber(health.tokens.activeTotal) : "—"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Nicht-revoked. Bulk-Revoke inaktive läuft über
              `/admin/tokens`.
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sektion D: Datenbank-Metriken */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4" /> Datenbank-Metriken
          </CardTitle>
          <CardDescription>
            Pro Tabelle: `pg_total_relation_size` (inkl. Indexe + TOAST)
            und Approximation der Zeilenzahl via `reltuples`.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {db ? (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 text-left">Tabelle</th>
                  <th className="py-1 text-right">Größe</th>
                  <th className="py-1 text-right">Zeilen (ca.)</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {db.tables.map((t) => (
                  <tr key={t.table}>
                    <td className="py-1.5 font-mono text-xs">{t.table}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {formatBytes(t.totalBytes)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-xs text-muted-foreground">
                      {formatNumber(t.approxRows)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="flex h-[180px] items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sektion E: Wartungs-Ops */}
      <MaintenanceSection health={health} onRefresh={() => void mutate()} />
    </div>
  );
}

/* ── Maintenance ────────────────────────────────────────────────────── */

function MaintenanceSection({
  health,
  onRefresh,
}: {
  health: HealthResponse | undefined;
  onRefresh: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Wartungs-Operationen</CardTitle>
        <CardDescription>
          Bulk-Operationen mit Dry-Run-Option. Jede erfolgreich
          angewandte Operation schreibt ein Audit-Event.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <MaintenanceOp
          op="sessions-purge-older-than"
          title="Abgelaufene/alte Sessions löschen"
          description={
            <>
              Löscht Sessions, deren `created_at` älter als X Tage ist.
              Aktuell abgelaufene Sessions:{" "}
              <strong>{health ? formatNumber(health.sessions.expired) : "…"}</strong>.
            </>
          }
          fields={[
            { key: "days", label: "Älter als (Tage)", defaultValue: "90" },
          ]}
          onAfterApply={onRefresh}
        />
        <MaintenanceOp
          op="invites-cleanup-expired"
          title="Abgelaufene Team-Invites revoken"
          description={
            <>
              Setzt `revoked_at` auf alle unangenommenen Invites mit
              abgelaufenem `expires_at`. Aktuell:{" "}
              <strong>{health ? formatNumber(health.invites.stale) : "…"}</strong>.
            </>
          }
          fields={[]}
          onAfterApply={onRefresh}
        />
        <MaintenanceOp
          op="users-backfill-default-locale"
          title="Default-Locale an User ohne Präferenz setzen"
          description={
            <>
              Füllt `users.preferred_locale` bei Null-Werten auf. Aktuell
              ohne Präferenz:{" "}
              <strong>{health ? formatNumber(health.users.missingLocale) : "…"}</strong>.
            </>
          }
          fields={[
            { key: "locale", label: "Locale", defaultValue: "de" },
          ]}
          onAfterApply={onRefresh}
        />
      </CardContent>
    </Card>
  );
}

function MaintenanceOp({
  op,
  title,
  description,
  fields,
  onAfterApply,
}: {
  op: string;
  title: string;
  description: React.ReactNode;
  fields: Array<{ key: string; label: string; defaultValue: string }>;
  onAfterApply: () => void;
}) {
  const [inputs, setInputs] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, f.defaultValue])),
  );
  const [dryResult, setDryResult] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  async function run(mode: "dryRun" | "apply") {
    setLoading(true);
    try {
      const payload: Record<string, unknown> = { op, mode };
      for (const f of fields) {
        const v = inputs[f.key];
        if (f.key === "days") payload.days = Number(v);
        else payload[f.key] = v;
      }
      const res = await fetch("/api/admin/system/maintenance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        wouldAffect?: number;
        affected?: number;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        toast.error(body.error ?? "Op fehlgeschlagen.");
        return;
      }
      if (mode === "dryRun") {
        setDryResult(body.wouldAffect ?? 0);
      } else {
        toast.success(`${body.affected} Einträge verarbeitet.`);
        setDryResult(null);
        onAfterApply();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-md border p-3">
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{description}</div>
      {fields.length > 0 ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.key} className="space-y-1">
              <Label className="text-xs">{f.label}</Label>
              <Input
                value={inputs[f.key]}
                onChange={(e) => {
                  setInputs((prev) => ({ ...prev, [f.key]: e.target.value }));
                  setDryResult(null);
                }}
                inputMode={f.key === "days" ? "numeric" : "text"}
              />
            </div>
          ))}
        </div>
      ) : null}
      {dryResult !== null ? (
        <div className="mt-3 rounded-md border bg-muted/40 p-2 text-xs">
          Dry-Run: <strong>{formatNumber(dryResult)}</strong> Einträge würden
          verarbeitet werden.
        </div>
      ) : null}
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => void run("dryRun")}
          disabled={loading}
        >
          Dry-Run
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => void run("apply")}
          disabled={loading || dryResult === null}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            "Jetzt ausführen"
          )}
        </Button>
      </div>
    </div>
  );
}
