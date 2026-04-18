"use client";

import { CheckCircle2, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** 60-sec-Cache für die Liste — passt zu admin-typischen Refreshes
 *  (wenig Veränderung zwischen zwei Views), der Button oben zwingt
 *  ein Re-Fetch bei Bedarf. */
const SWR_OPTS = {
  refreshInterval: 60_000,
  revalidateOnFocus: false,
  dedupingInterval: 30_000,
};

interface UserRow {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  isAdmin: boolean;
  canCreateTeams: boolean;
  disabledAt: string | null;
  preferredLocale: string | null;
  createdAt: string;
  lastLogin: string | null;
  accountCount: number;
}

interface ListResponse {
  users: UserRow[];
  total: number;
  page: number;
  pageSize: number;
}

const fetcher = (url: string) =>
  fetch(url).then(async (r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as ListResponse;
  });

export function UsersExplorer() {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [sort, setSort] = useState<"created" | "login" | "email">("created");
  const [page, setPage] = useState(1);
  const [onlyAdmins, setOnlyAdmins] = useState(false);
  const [onlyTeamCreators, setOnlyTeamCreators] = useState(false);
  const [onlyUnverified, setOnlyUnverified] = useState(false);
  const [onlyDisabled, setOnlyDisabled] = useState(false);

  // Debounce search input (250ms) so typing doesn't hammer the API.
  // useSWR's dedupingInterval would help, but the URL changing on
  // each keystroke creates a new cache key regardless.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const params = new URLSearchParams();
  if (debouncedQ) params.set("q", debouncedQ);
  params.set("sort", sort);
  params.set("page", String(page));
  if (onlyAdmins) params.set("onlyAdmins", "1");
  if (onlyTeamCreators) params.set("onlyTeamCreators", "1");
  if (onlyUnverified) params.set("onlyUnverified", "1");
  if (onlyDisabled) params.set("onlyDisabled", "1");
  const url = `/api/admin/users?${params.toString()}`;

  const { data, error, isLoading, mutate } = useSWR<ListResponse>(
    url,
    fetcher,
    SWR_OPTS,
  );

  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  async function toggleFlag(
    userId: string,
    field: "canCreateTeams",
    next: boolean,
  ) {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ [field]: next }),
    });
    if (!res.ok) {
      toast.error("Konnte Flag nicht ändern.");
      return;
    }
    toast.success("Geändert.");
    void mutate();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Suche nach Email oder Name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-sm"
          autoComplete="off"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          className="h-9 rounded-md border bg-background px-2 text-xs"
        >
          <option value="created">Erstellt</option>
          <option value="login">Letzter Login</option>
          <option value="email">Email</option>
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

      <div className="flex flex-wrap gap-3 text-xs">
        <FilterChip
          checked={onlyAdmins}
          onChange={setOnlyAdmins}
          label="Nur Admins"
        />
        <FilterChip
          checked={onlyTeamCreators}
          onChange={setOnlyTeamCreators}
          label="Nur Team-Ersteller"
        />
        <FilterChip
          checked={onlyUnverified}
          onChange={setOnlyUnverified}
          label="Nur unverifizierte"
        />
        <FilterChip
          checked={onlyDisabled}
          onChange={setOnlyDisabled}
          label="Nur gesperrte"
        />
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
              <th className="px-3 py-2 text-left">Email / Name</th>
              <th className="px-3 py-2 text-left">Flags</th>
              <th className="px-3 py-2 text-left">Locale</th>
              <th className="px-3 py-2 text-left">Erstellt</th>
              <th className="px-3 py-2 text-left">Letzter Login</th>
              <th className="px-3 py-2 text-left">Accounts</th>
              <th className="px-3 py-2 text-left">Team-Erst.</th>
              <th className="px-3 py-2 text-left">Aktionen</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data?.users.map((u) => (
              <tr key={u.id} className={u.disabledAt ? "opacity-50" : ""}>
                <td className="px-3 py-2">
                  <div className="font-medium">{u.email}</div>
                  {u.name ? (
                    <div className="text-xs text-muted-foreground">{u.name}</div>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {u.isAdmin ? (
                      <span className="inline-flex items-center gap-0.5 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                        <ShieldCheck className="h-2.5 w-2.5" />
                        Admin
                      </span>
                    ) : null}
                    {u.emailVerified ? (
                      <span className="inline-flex items-center gap-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        verifiziert
                      </span>
                    ) : (
                      <span className="rounded border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        unverifiziert
                      </span>
                    )}
                    {u.disabledAt ? (
                      <span className="rounded border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:text-red-300">
                        gesperrt
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-2 text-xs">
                  {u.preferredLocale ? u.preferredLocale.toUpperCase() : "—"}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {new Date(u.createdAt).toLocaleDateString("de-DE")}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {u.lastLogin
                    ? new Date(u.lastLogin).toLocaleDateString("de-DE")
                    : "—"}
                </td>
                <td className="px-3 py-2 tabular-nums">{u.accountCount}</td>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={u.canCreateTeams}
                    onChange={(e) =>
                      void toggleFlag(u.id, "canCreateTeams", e.target.checked)
                    }
                    className="h-4 w-4"
                    aria-label="Team-Erstellung erlauben"
                  />
                </td>
                <td className="px-3 py-2">
                  <Button
                    size="sm"
                    variant="outline"
                    nativeButton={false}
                    render={<Link href={`/admin/users/${u.id}`} />}
                  >
                    Öffnen
                  </Button>
                </td>
              </tr>
            ))}
            {!data && !error && isLoading ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                </td>
              </tr>
            ) : null}
            {data && data.users.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  Keine User gefunden.
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

function FilterChip({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label
      className={
        checked
          ? "inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-amber-800 dark:text-amber-200"
          : "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-muted-foreground transition-colors hover:text-foreground"
      }
    >
      <input
        type="checkbox"
        className="h-3 w-3"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

