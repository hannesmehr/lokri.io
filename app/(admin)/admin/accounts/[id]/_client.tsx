"use client";

import { Copy, Loader2, RefreshCw, Save } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
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
import { SsoSection } from "./_sso-section";

interface PlanOption {
  id: string;
  name: string;
  isSeatBased: boolean;
  isPurchasable: boolean;
}

interface AccountDetail {
  account: {
    id: string;
    name: string;
    type: "personal" | "team";
    planId: string;
    planName: string;
    planExpiresAt: string | null;
    planRenewedAt: string | null;
    quotaOverride: { bytes?: number; files?: number; notes?: number } | null;
    createdAt: string;
    isSeatBased: boolean;
    planMaxBytes: number;
    planMaxFiles: number;
    planMaxNotes: number;
  };
  members: Array<{
    userId: string;
    email: string;
    name: string;
    role: string;
    joinedAt: string;
  }>;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    description: string;
    grossCents: number;
    status: string;
    issuedAt: string;
  }>;
  tokens: Array<{
    id: string;
    name: string;
    tokenPrefix: string;
    createdAt: string;
    lastUsedAt: string | null;
    revokedAt: string | null;
    scopeType: string | null;
    readOnly: boolean;
  }>;
  usage: {
    usedBytes: number;
    filesCount: number;
    notesCount: number;
  } | null;
  effectiveQuota: {
    planId: string;
    usedBytes: number;
    filesCount: number;
    notesCount: number;
    maxBytes: number;
    maxFiles: number;
    maxNotes: number;
  } | null;
}

const fetcher = (url: string) =>
  fetch(url).then(async (r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as AccountDetail;
  });

export function AccountDetailClient({
  accountId,
  plans,
}: {
  accountId: string;
  plans: PlanOption[];
}) {
  const { data, error, isLoading, mutate } = useSWR<AccountDetail>(
    `/api/admin/accounts/${accountId}`,
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Account konnte nicht geladen werden.
      </div>
    );
  }

  if (!data || isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Lade Account…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HeaderCard account={data.account} onRefresh={() => void mutate()} />
      <QuotaCard
        account={data.account}
        usage={data.usage}
        effectiveQuota={data.effectiveQuota}
        accountId={accountId}
        onMutated={() => void mutate()}
      />
      <PlanCard
        account={data.account}
        plans={plans}
        accountId={accountId}
        onMutated={() => void mutate()}
      />
      <MembersCard members={data.members} accountType={data.account.type} />
      {data.account.type === "team" ? (
        <SsoSection accountId={accountId} />
      ) : null}
      <TokensCard tokens={data.tokens} />
      <InvoicesCard invoices={data.invoices} />
    </div>
  );
}

/* ── Header ─────────────────────────────────────────────────────────── */

function HeaderCard({
  account,
  onRefresh,
}: {
  account: AccountDetail["account"];
  onRefresh: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            {account.name}
            <AdminStatusBadge
              variant={account.type === "team" ? "info" : "neutral"}
            >
              {account.type === "team" ? "Team" : "Personal"}
            </AdminStatusBadge>
          </CardTitle>
          <CardDescription>
            ID{" "}
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(account.id);
                toast.success("ID kopiert");
              }}
              className="inline-flex items-center gap-1 font-mono text-xs hover:underline"
              title="Kopieren"
            >
              {account.id.slice(0, 8)}…
              <Copy className="h-2.5 w-2.5" />
            </button>
            {" · erstellt am "}
            {new Date(account.createdAt).toLocaleDateString("de-DE")}
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          <RefreshCw className="h-3.5 w-3.5" />
          Aktualisieren
        </Button>
      </CardHeader>
    </Card>
  );
}

/* ── Quota + Override ───────────────────────────────────────────────── */

function QuotaCard({
  account,
  usage,
  effectiveQuota,
  accountId,
  onMutated,
}: {
  account: AccountDetail["account"];
  usage: AccountDetail["usage"];
  effectiveQuota: AccountDetail["effectiveQuota"];
  accountId: string;
  onMutated: () => void;
}) {
  const override = account.quotaOverride ?? {};

  // Edit-Felder: leer = kein Override für dieses Feld. Bytes werden in
  // MB eingegeben — roher byte-Wert wäre unlesbar.
  const [bytesMB, setBytesMB] = useState(
    override.bytes != null ? Math.round(override.bytes / (1024 * 1024)).toString() : "",
  );
  const [filesInput, setFilesInput] = useState(
    override.files != null ? String(override.files) : "",
  );
  const [notesInput, setNotesInput] = useState(
    override.notes != null ? String(override.notes) : "",
  );
  const [saving, setSaving] = useState(false);

  // Re-sync when SWR re-fetches.
  useEffect(() => {
    setBytesMB(
      override.bytes != null ? Math.round(override.bytes / (1024 * 1024)).toString() : "",
    );
    setFilesInput(override.files != null ? String(override.files) : "");
    setNotesInput(override.notes != null ? String(override.notes) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.quotaOverride]);

  async function save() {
    const next: { bytes?: number; files?: number; notes?: number } = {};
    if (bytesMB.trim()) {
      const n = Number(bytesMB);
      if (!Number.isFinite(n) || n < 0) {
        toast.error("Bytes-Override: bitte nichtnegative Zahl in MB");
        return;
      }
      next.bytes = Math.round(n * 1024 * 1024);
    }
    if (filesInput.trim()) {
      const n = Number(filesInput);
      if (!Number.isInteger(n) || n < 0) {
        toast.error("Files-Override: bitte nichtnegative ganze Zahl");
        return;
      }
      next.files = n;
    }
    if (notesInput.trim()) {
      const n = Number(notesInput);
      if (!Number.isInteger(n) || n < 0) {
        toast.error("Notes-Override: bitte nichtnegative ganze Zahl");
        return;
      }
      next.notes = n;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/accounts/${accountId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          quotaOverride: Object.keys(next).length > 0 ? next : null,
        }),
      });
      if (!res.ok) {
        toast.error("Override konnte nicht gesetzt werden.");
        return;
      }
      toast.success("Override aktualisiert");
      onMutated();
    } finally {
      setSaving(false);
    }
  }

  async function clearOverride() {
    if (!confirm("Override wirklich zurücksetzen?")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/accounts/${accountId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ quotaOverride: null }),
      });
      if (!res.ok) {
        toast.error("Override konnte nicht entfernt werden.");
        return;
      }
      toast.success("Override entfernt");
      onMutated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quota & Limits</CardTitle>
        <CardDescription>
          Plan-Grund-Limits links, aktuelle Nutzung mittig, Admin-Override
          rechts. Leeres Feld = Plan-Limit greift.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 text-sm sm:grid-cols-3">
          <div className="rounded-md border p-3">
            <div className="mb-1 text-xs font-medium uppercase text-muted-foreground">
              Aktuelle Nutzung
            </div>
            <div>
              Bytes:{" "}
              <span className="tabular-nums">
                {formatBytes(usage?.usedBytes ?? 0)}
              </span>
            </div>
            <div>
              Files:{" "}
              <span className="tabular-nums">{usage?.filesCount ?? 0}</span>
            </div>
            <div>
              Notes:{" "}
              <span className="tabular-nums">{usage?.notesCount ?? 0}</span>
            </div>
          </div>
          <div className="rounded-md border p-3">
            <div className="mb-1 text-xs font-medium uppercase text-muted-foreground">
              Effektive Grenze
            </div>
            {effectiveQuota ? (
              <>
                <div>
                  Bytes:{" "}
                  <span className="tabular-nums">
                    {formatBytes(effectiveQuota.maxBytes)}
                  </span>
                </div>
                <div>
                  Files:{" "}
                  <span className="tabular-nums">
                    {effectiveQuota.maxFiles}
                  </span>
                </div>
                <div>
                  Notes:{" "}
                  <span className="tabular-nums">
                    {effectiveQuota.maxNotes}
                  </span>
                </div>
                {effectiveQuota.planId !== account.planId ? (
                  <AdminStatusBadge variant="warning" className="mt-1">
                    Plan abgelaufen — Free-Fallback aktiv.
                  </AdminStatusBadge>
                ) : null}
              </>
            ) : (
              <div className="text-muted-foreground">—</div>
            )}
          </div>
          <div className="rounded-md border p-3">
            <div className="mb-1 text-xs font-medium uppercase text-muted-foreground">
              Plan-Basis
            </div>
            <div>
              Bytes:{" "}
              <span className="tabular-nums">
                {formatBytes(account.planMaxBytes)}
              </span>
            </div>
            <div>
              Files:{" "}
              <span className="tabular-nums">{account.planMaxFiles}</span>
            </div>
            <div>
              Notes:{" "}
              <span className="tabular-nums">{account.planMaxNotes}</span>
            </div>
            {account.isSeatBased ? (
              <div className="mt-1 text-[10px] text-muted-foreground">
                Seat-basiert — effektives Limit × aktive Mitglieder.
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
          <div className="text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
            Admin-Override
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="override-bytes" className="text-xs">
                Bytes (in MB)
              </Label>
              <Input
                id="override-bytes"
                value={bytesMB}
                onChange={(e) => setBytesMB(e.target.value)}
                placeholder="leer = Plan"
                inputMode="decimal"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="override-files" className="text-xs">
                Files
              </Label>
              <Input
                id="override-files"
                value={filesInput}
                onChange={(e) => setFilesInput(e.target.value)}
                placeholder="leer = Plan"
                inputMode="numeric"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="override-notes" className="text-xs">
                Notes
              </Label>
              <Input
                id="override-notes"
                value={notesInput}
                onChange={(e) => setNotesInput(e.target.value)}
                placeholder="leer = Plan"
                inputMode="numeric"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => void save()} disabled={saving}>
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Override speichern
            </Button>
            {account.quotaOverride ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void clearOverride()}
                disabled={saving}
              >
                Zurücksetzen
              </Button>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Plan-Wechsel + Expiry ──────────────────────────────────────────── */

function PlanCard({
  account,
  plans,
  accountId,
  onMutated,
}: {
  account: AccountDetail["account"];
  plans: PlanOption[];
  accountId: string;
  onMutated: () => void;
}) {
  const [planId, setPlanId] = useState(account.planId);
  const [expiryInput, setExpiryInput] = useState(
    account.planExpiresAt ? account.planExpiresAt.slice(0, 10) : "",
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPlanId(account.planId);
    setExpiryInput(
      account.planExpiresAt ? account.planExpiresAt.slice(0, 10) : "",
    );
  }, [account.planId, account.planExpiresAt]);

  async function save() {
    const updates: Record<string, unknown> = {};
    if (planId !== account.planId) updates.planId = planId;
    const newExpiry = expiryInput
      ? new Date(expiryInput + "T23:59:59Z").toISOString()
      : null;
    const currExpiry = account.planExpiresAt ?? null;
    if (newExpiry !== currExpiry) updates.planExpiresAt = newExpiry;

    if (Object.keys(updates).length === 0) {
      toast.info("Keine Änderung");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/accounts/${accountId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        toast.error(body?.error ?? "Konnte Plan nicht aktualisieren.");
        return;
      }
      toast.success("Plan aktualisiert");
      onMutated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plan & Laufzeit</CardTitle>
        <CardDescription>
          Plan-Tier und Ablaufdatum direkt setzen. Nützlich für manuelle
          Team-Aktivierungen, Kulanz-Verlängerungen oder Plan-Downgrades.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="plan-select" className="text-xs">
              Plan
            </Label>
            <select
              id="plan-select"
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.id})
                  {p.isSeatBased ? " · seat-basiert" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="plan-expiry" className="text-xs">
              Ablaufdatum
            </Label>
            <Input
              id="plan-expiry"
              type="date"
              value={expiryInput}
              onChange={(e) => setExpiryInput(e.target.value)}
            />
            <div className="text-[10px] text-muted-foreground">
              leer lassen für kein Ablauf (z.B. Team-Plan ohne Expiry)
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => void save()} disabled={saving}>
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Änderungen speichern
          </Button>
          {account.planRenewedAt ? (
            <div className="text-xs text-muted-foreground">
              Zuletzt verlängert:{" "}
              {new Date(account.planRenewedAt).toLocaleDateString("de-DE")}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Members ────────────────────────────────────────────────────────── */

function MembersCard({
  members,
  accountType,
}: {
  members: AccountDetail["members"];
  accountType: "personal" | "team";
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Mitglieder{" "}
          <span className="text-xs font-normal text-muted-foreground">
            ({members.length})
          </span>
        </CardTitle>
        <CardDescription>
          {accountType === "team"
            ? "Alle Team-Mitglieder mit Rolle. Member-Verwaltung (entfernen, Rolle ändern) läuft im Team-Settings-Flow."
            : "Personal-Account — normalerweise genau ein Mitglied (der Besitzer)."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {members.length === 0 ? (
          <div className="text-sm text-muted-foreground">Keine Mitglieder.</div>
        ) : (
          <ul className="divide-y text-sm">
            {members.map((m) => (
              <li
                key={m.userId}
                className="flex items-center justify-between gap-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/admin/users/${m.userId}`}
                    className="truncate font-medium hover:underline"
                  >
                    {m.email}
                  </Link>
                  {m.name ? (
                    <div className="truncate text-xs text-muted-foreground">
                      {m.name}
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="rounded border bg-muted/40 px-1.5 py-0.5">
                    {m.role}
                  </span>
                  <span>
                    seit {new Date(m.joinedAt).toLocaleDateString("de-DE")}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Tokens ─────────────────────────────────────────────────────────── */

function TokensCard({ tokens }: { tokens: AccountDetail["tokens"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          MCP-Tokens{" "}
          <span className="text-xs font-normal text-muted-foreground">
            ({tokens.length})
          </span>
        </CardTitle>
        <CardDescription>
          Lesender Überblick — Revoke einzelner Tokens über die globale
          Token-Übersicht.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {tokens.length === 0 ? (
          <div className="text-sm text-muted-foreground">Keine Tokens.</div>
        ) : (
          <ul className="divide-y text-sm">
            {tokens.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{t.name}</div>
                  <div className="truncate font-mono text-[10px] text-muted-foreground">
                    {t.tokenPrefix}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <AdminStatusBadge variant="neutral">
                    {t.scopeType}
                  </AdminStatusBadge>
                  {t.readOnly ? (
                    <AdminStatusBadge variant="neutral">
                      read-only
                    </AdminStatusBadge>
                  ) : null}
                  {t.revokedAt ? (
                    <AdminStatusBadge variant="danger">revoked</AdminStatusBadge>
                  ) : (
                    <AdminStatusBadge variant="success">aktiv</AdminStatusBadge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Invoices ───────────────────────────────────────────────────────── */

function InvoicesCard({ invoices }: { invoices: AccountDetail["invoices"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Letzte Rechnungen</CardTitle>
        <CardDescription>Die letzten 10. Details unter „Rechnungen".</CardDescription>
      </CardHeader>
      <CardContent>
        {invoices.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            Keine Rechnungen für diesen Account.
          </div>
        ) : (
          <ul className="divide-y text-sm">
            {invoices.map((i) => (
              <li
                key={i.id}
                className="flex items-center justify-between gap-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/admin/invoices/${i.id}`}
                    className="truncate font-medium hover:underline"
                  >
                    {i.invoiceNumber}
                  </Link>
                  <div className="truncate text-xs text-muted-foreground">
                    {i.description}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="rounded border bg-muted/40 px-1.5 py-0.5 text-muted-foreground">
                    {i.status}
                  </span>
                  <span className="tabular-nums">
                    {(i.grossCents / 100).toLocaleString("de-DE", {
                      style: "currency",
                      currency: "EUR",
                    })}
                  </span>
                  <span className="text-muted-foreground">
                    {new Date(i.issuedAt).toLocaleDateString("de-DE")}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Utils ──────────────────────────────────────────────────────────── */

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
