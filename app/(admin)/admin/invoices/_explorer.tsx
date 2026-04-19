"use client";

import { Download, Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
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
import { Input } from "@/components/ui/input";

const SWR_OPTS = {
  refreshInterval: 60_000,
  revalidateOnFocus: false,
  dedupingInterval: 30_000,
};

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  ownerAccountId: string;
  ownerAccountName: string;
  customerName: string;
  customerEmail: string;
  description: string;
  grossCents: number;
  netCents: number;
  taxCents: number;
  status: string;
  paymentMethod: string;
  issuedAt: string;
}
interface ListResponse {
  invoices: InvoiceRow[];
  total: number;
  page: number;
  pageSize: number;
}

const fetcher = (url: string) =>
  fetch(url).then(async (r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as ListResponse;
  });

export function InvoicesExplorer() {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [status, setStatus] = useState("");
  const [ownerAccountId, setOwnerAccountId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sort, setSort] = useState<"issued" | "amount">("issued");
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
  if (status) params.set("status", status);
  if (ownerAccountId) params.set("ownerAccountId", ownerAccountId);
  if (fromDate) params.set("from", new Date(fromDate).toISOString());
  if (toDate) params.set("to", new Date(toDate + "T23:59:59").toISOString());
  params.set("sort", sort);
  params.set("page", String(page));
  const url = `/api/admin/invoices?${params.toString()}`;

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
          placeholder="Suche: Nr., Email, Beschreibung…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-sm"
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
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-md border bg-background px-2 text-xs"
        >
          <option value="">Alle Status</option>
          <option value="paid">paid</option>
          <option value="refunded">refunded</option>
          <option value="failed">failed</option>
        </select>
        <Input
          type="date"
          value={fromDate}
          onChange={(e) => {
            setFromDate(e.target.value);
            setPage(1);
          }}
          className="max-w-[150px]"
          title="Von"
        />
        <Input
          type="date"
          value={toDate}
          onChange={(e) => {
            setToDate(e.target.value);
            setPage(1);
          }}
          className="max-w-[150px]"
          title="Bis"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          className="h-9 rounded-md border bg-background px-2 text-xs"
        >
          <option value="issued">Ausgestellt</option>
          <option value="amount">Betrag</option>
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

      <AdminTable>
        <AdminTableHead>
          <tr>
            <AdminTh>Nr.</AdminTh>
            <AdminTh>Account</AdminTh>
            <AdminTh>Kunde</AdminTh>
            <AdminTh>Beschreibung</AdminTh>
            <AdminTh align="right">Brutto</AdminTh>
            <AdminTh>Status</AdminTh>
            <AdminTh>Methode</AdminTh>
            <AdminTh>Ausgestellt</AdminTh>
            <AdminTh>Aktionen</AdminTh>
          </tr>
        </AdminTableHead>
        <AdminTableBody>
          {data?.invoices.map((i) => (
            <tr key={i.id}>
              <AdminTd className="font-mono text-xs">{i.invoiceNumber}</AdminTd>
              <AdminTd>
                <Link
                  href={`/admin/accounts/${i.ownerAccountId}`}
                  className="hover:underline"
                >
                  {i.ownerAccountName}
                </Link>
              </AdminTd>
              <AdminTd className="text-xs">
                <div className="font-medium">{i.customerName}</div>
                <div className="text-muted-foreground">{i.customerEmail}</div>
              </AdminTd>
              <AdminTd className="text-xs">{i.description}</AdminTd>
              <AdminTd align="right" className="tabular-nums text-xs">
                {(i.grossCents / 100).toLocaleString("de-DE", {
                  style: "currency",
                  currency: "EUR",
                })}
              </AdminTd>
              <AdminTd>
                <AdminStatusBadge
                  variant={
                    i.status === "paid"
                      ? "success"
                      : i.status === "refunded"
                        ? "warning"
                        : i.status === "failed"
                          ? "danger"
                          : "neutral"
                  }
                >
                  {i.status}
                </AdminStatusBadge>
              </AdminTd>
              <AdminTd>
                <AdminStatusBadge
                  variant={i.paymentMethod === "manual" ? "warning" : "neutral"}
                >
                  {i.paymentMethod}
                </AdminStatusBadge>
              </AdminTd>
              <AdminTd className="text-xs text-muted-foreground">
                {new Date(i.issuedAt).toLocaleDateString("de-DE")}
              </AdminTd>
              <AdminTd>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    nativeButton={false}
                    render={<Link href={`/admin/invoices/${i.id}`} />}
                  >
                    Öffnen
                  </Button>
                  <a
                    href={`/api/admin/invoices/${i.id}/pdf`}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Download className="h-3.5 w-3.5" />
                    PDF
                  </a>
                </div>
              </AdminTd>
            </tr>
          ))}
          {!data && !error && isLoading ? (
            <AdminTableLoading colSpan={9} />
          ) : null}
          {data && data.invoices.length === 0 ? (
            <AdminTableEmpty colSpan={9}>
              Keine Rechnungen gefunden.
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
    </div>
  );
}
