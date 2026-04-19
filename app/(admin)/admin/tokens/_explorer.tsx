"use client";

import { Loader2, RefreshCw, Trash2, Zap } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import {
  AdminTable,
  AdminTableBody,
  AdminTableEmpty,
  AdminTableHead,
  AdminTableLoading,
  AdminTd,
  AdminTh,
} from "@/components/admin/admin-table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SWR_OPTS = {
  refreshInterval: 60_000,
  revalidateOnFocus: false,
};

interface TokenRow {
  id: string;
  name: string;
  tokenPrefix: string;
  scopeType: string;
  readOnly: boolean;
  spaceScope: string[] | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  ownerAccountId: string;
  ownerAccountName: string;
  createdByUserId: string | null;
  creatorEmail: string | null;
  creatorName: string | null;
}

interface ListResponse {
  tokens: TokenRow[];
  total: number;
  page: number;
  pageSize: number;
}

const fetcher = (url: string) =>
  fetch(url).then(async (r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as ListResponse;
  });

export function TokensExplorer() {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [status, setStatus] = useState<"active" | "revoked" | "all">("active");
  const [scopeType, setScopeType] = useState("");
  const [inactiveDays, setInactiveDays] = useState("");
  const [sort, setSort] = useState<"created" | "lastUsed" | "name">("created");
  const [page, setPage] = useState(1);
  const [bulkOpen, setBulkOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const params = new URLSearchParams();
  if (debouncedQ) params.set("q", debouncedQ);
  params.set("status", status);
  if (scopeType) params.set("scopeType", scopeType);
  if (inactiveDays.trim()) params.set("inactiveDays", inactiveDays);
  params.set("sort", sort);
  params.set("page", String(page));
  const url = `/api/admin/tokens?${params.toString()}`;

  const { data, error, isLoading, mutate } = useSWR<ListResponse>(
    url,
    fetcher,
    SWR_OPTS,
  );
  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  async function revokeOne(id: string, name: string) {
    if (!confirm(`Token „${name}" wirklich revoken?`)) return;
    const res = await fetch(`/api/admin/tokens/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Konnte Token nicht revoken.");
      return;
    }
    toast.success("Token revoked.");
    void mutate();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Suche: Name, Prefix, Account, Ersteller-Email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-sm"
        />
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as typeof status);
            setPage(1);
          }}
          className="h-9 rounded-md border bg-background px-2 text-xs"
        >
          <option value="active">Aktive</option>
          <option value="revoked">Revoked</option>
          <option value="all">Alle</option>
        </select>
        <select
          value={scopeType}
          onChange={(e) => {
            setScopeType(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-md border bg-background px-2 text-xs"
        >
          <option value="">Alle Scopes</option>
          <option value="personal">personal</option>
          <option value="team">team</option>
        </select>
        <Input
          placeholder="Inaktive Tage (z.B. 180)"
          value={inactiveDays}
          onChange={(e) => {
            setInactiveDays(e.target.value);
            setPage(1);
          }}
          className="max-w-[160px]"
          inputMode="numeric"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          className="h-9 rounded-md border bg-background px-2 text-xs"
        >
          <option value="created">Erstellt</option>
          <option value="lastUsed">Zuletzt benutzt</option>
          <option value="name">Name</option>
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
        <Button size="sm" onClick={() => setBulkOpen(true)}>
          <Zap className="h-3.5 w-3.5" />
          Bulk-Revoke inaktive
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

      <AdminTable>
        <AdminTableHead>
          <tr>
            <AdminTh>Name / Prefix</AdminTh>
            <AdminTh>Account</AdminTh>
            <AdminTh>Ersteller</AdminTh>
            <AdminTh>Scope</AdminTh>
            <AdminTh>Erstellt</AdminTh>
            <AdminTh>Zuletzt benutzt</AdminTh>
            <AdminTh>Status</AdminTh>
            <AdminTh>Aktionen</AdminTh>
          </tr>
        </AdminTableHead>
        <AdminTableBody>
          {data?.tokens.map((t) => {
            const inactive =
              !t.revokedAt &&
              ((t.lastUsedAt &&
                Date.now() - new Date(t.lastUsedAt).getTime() >
                  180 * 24 * 60 * 60 * 1000) ||
                (!t.lastUsedAt &&
                  Date.now() - new Date(t.createdAt).getTime() >
                    90 * 24 * 60 * 60 * 1000));
            return (
              <tr key={t.id} className={t.revokedAt ? "opacity-50" : ""}>
                <AdminTd>
                  <div className="font-medium">{t.name}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">
                    {t.tokenPrefix}
                  </div>
                </AdminTd>
                <AdminTd>
                  <Link
                    href={`/admin/accounts/${t.ownerAccountId}`}
                    className="text-xs hover:underline"
                  >
                    {t.ownerAccountName}
                  </Link>
                </AdminTd>
                <AdminTd className="text-xs">
                  {t.creatorEmail ? (
                    <Link
                      href={`/admin/users/${t.createdByUserId}`}
                      className="hover:underline"
                    >
                      {t.creatorEmail}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </AdminTd>
                <AdminTd>
                  <div className="flex flex-wrap gap-1">
                    <AdminStatusBadge variant="neutral">
                      {t.scopeType}
                    </AdminStatusBadge>
                    {t.readOnly ? (
                      <AdminStatusBadge variant="neutral">
                        read-only
                      </AdminStatusBadge>
                    ) : null}
                    {t.spaceScope && t.spaceScope.length > 0 ? (
                      <span
                        title={t.spaceScope.join("\n")}
                        className="inline-block"
                      >
                        <AdminStatusBadge variant="neutral">
                          {t.spaceScope.length} Spaces
                        </AdminStatusBadge>
                      </span>
                    ) : null}
                  </div>
                </AdminTd>
                <AdminTd className="text-xs text-muted-foreground">
                  {new Date(t.createdAt).toLocaleDateString("de-DE")}
                </AdminTd>
                <AdminTd className="text-xs text-muted-foreground">
                  {t.lastUsedAt
                    ? new Date(t.lastUsedAt).toLocaleDateString("de-DE")
                    : "nie"}
                </AdminTd>
                <AdminTd>
                  {t.revokedAt ? (
                    <AdminStatusBadge variant="danger">revoked</AdminStatusBadge>
                  ) : inactive ? (
                    <AdminStatusBadge variant="warning">inaktiv</AdminStatusBadge>
                  ) : (
                    <AdminStatusBadge variant="success">aktiv</AdminStatusBadge>
                  )}
                </AdminTd>
                <AdminTd>
                  {!t.revokedAt ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void revokeOne(t.id, t.name)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Revoke
                    </Button>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">—</span>
                  )}
                </AdminTd>
              </tr>
            );
          })}
          {!data && !error && isLoading ? (
            <AdminTableLoading colSpan={8} />
          ) : null}
          {data && data.tokens.length === 0 ? (
            <AdminTableEmpty colSpan={8}>
              Keine Tokens gefunden.
            </AdminTableEmpty>
          ) : null}
        </AdminTableBody>
      </AdminTable>

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

      <BulkRevokeDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        onDone={() => void mutate()}
      />
    </div>
  );
}

/* ── Bulk-Revoke Dialog ─────────────────────────────────────────────── */

function BulkRevokeDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const [inactiveDays, setInactiveDays] = useState("180");
  const [unusedOlderThanDays, setUnusedOlderThanDays] = useState("90");
  const [dryResult, setDryResult] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  async function run(mode: "dryRun" | "apply") {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/tokens/bulk-revoke-inactive", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode,
          inactiveDays: Number(inactiveDays),
          unusedOlderThanDays: Number(unusedOlderThanDays),
        }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        wouldRevoke?: number;
        revoked?: number;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        toast.error(body.error ?? "Bulk-Revoke fehlgeschlagen.");
        return;
      }
      if (mode === "dryRun") {
        setDryResult(body.wouldRevoke ?? 0);
      } else {
        toast.success(`${body.revoked} Token(s) revoked.`);
        onDone();
        onOpenChange(false);
        setDryResult(null);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bulk-Revoke inaktive Tokens</DialogTitle>
          <DialogDescription>
            Revoked alle nicht-revoked Tokens, die entweder seit X Tagen
            nicht mehr benutzt wurden, oder nie benutzt wurden und älter
            als Y Tage sind. Dry-Run zeigt nur die Zahl.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">
                Inaktiv ab (Tage seit letzter Nutzung)
              </Label>
              <Input
                value={inactiveDays}
                onChange={(e) => {
                  setInactiveDays(e.target.value);
                  setDryResult(null);
                }}
                inputMode="numeric"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">
                Nie benutzt & älter als (Tage)
              </Label>
              <Input
                value={unusedOlderThanDays}
                onChange={(e) => {
                  setUnusedOlderThanDays(e.target.value);
                  setDryResult(null);
                }}
                inputMode="numeric"
              />
            </div>
          </div>
          {dryResult !== null ? (
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              Dry-Run: <strong>{dryResult}</strong> Tokens würden revoked werden.
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => void run("dryRun")}
            disabled={loading}
          >
            Dry-Run
          </Button>
          <Button
            variant="destructive"
            onClick={() => void run("apply")}
            disabled={loading || dryResult === null}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Jetzt revoken"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
