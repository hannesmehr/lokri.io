"use client";

import { Loader2, Plus } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
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

/**
 * Admin-Dialog zum Anlegen eines Team-Accounts.
 *
 * Analog zum User-Create-Dialog (`app/(admin)/admin/users/_create-
 * dialog.tsx`): Form-State lebt im Child-Component, das nur bei
 * `open=true` gemountet ist — so startet jede Öffnung frisch ohne
 * `useEffect`-Reset.
 *
 * Plan-Liste ist hier hart codiert (siehe Kommentar in
 * `lib/admin/create-account-schema.ts`). Owner-Picker ist ein
 * Typeahead-Select gegen `GET /api/admin/users?q=…` — dieselbe
 * API, die die User-Liste im Explorer nutzt.
 */

type PlanId = "free" | "starter" | "pro" | "business" | "team";

const PLAN_OPTIONS: Array<{ id: PlanId; label: string }> = [
  { id: "team", label: "Team (seat-based, 5 GB/seat)" },
  { id: "free", label: "Free (20 MB, 100 files)" },
  { id: "starter", label: "Starter (100 MB)" },
  { id: "pro", label: "Pro (1 GB)" },
  { id: "business", label: "Business (10 GB)" },
];

export function CreateAccountButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        Neuer Team-Account
      </Button>
      <CreateAccountDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function CreateAccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {open ? <CreateAccountForm onClose={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

interface OwnerCandidate {
  id: string;
  email: string;
  name: string;
}

function CreateAccountForm({ onClose }: { onClose: () => void }) {
  const { mutate } = useSWRConfig();
  const nameId = useId();
  const planId = useId();
  const quotaBytesId = useId();
  const quotaFilesId = useId();
  const quotaNotesId = useId();

  const [name, setName] = useState("");
  const [plan, setPlan] = useState<PlanId>("team");

  const [ownerEnabled, setOwnerEnabled] = useState(false);
  const [ownerSearch, setOwnerSearch] = useState("");
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [ownerEmail, setOwnerEmail] = useState<string>("");

  const [quotaOpen, setQuotaOpen] = useState(false);
  const [quotaBytes, setQuotaBytes] = useState("");
  const [quotaFiles, setQuotaFiles] = useState("");
  const [quotaNotes, setQuotaNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameValid = name.trim().length >= 1;
  const ownerValid = !ownerEnabled || !!ownerId;
  const quotaValid = useMemo(() => {
    if (!quotaOpen) return true;
    for (const v of [quotaBytes, quotaFiles, quotaNotes]) {
      if (!v) continue;
      const n = Number(v);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return false;
    }
    return true;
  }, [quotaOpen, quotaBytes, quotaFiles, quotaNotes]);
  const submitDisabled = submitting || !nameValid || !ownerValid || !quotaValid;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const quotaOverride = quotaOpen
        ? {
            ...(quotaBytes ? { bytes: Number(quotaBytes) } : {}),
            ...(quotaFiles ? { files: Number(quotaFiles) } : {}),
            ...(quotaNotes ? { notes: Number(quotaNotes) } : {}),
          }
        : undefined;
      const payload = {
        name: name.trim(),
        planId: plan,
        ownerUserId: ownerEnabled && ownerId ? ownerId : undefined,
        quotaOverride:
          quotaOverride && Object.keys(quotaOverride).length > 0
            ? quotaOverride
            : undefined,
      };
      const res = await fetch("/api/admin/accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string; details?: { code?: string } }
          | null;
        const code = body?.details?.code;
        const msg =
          code === "admin.account.planNotFound"
            ? `Plan "${plan}" existiert nicht.`
            : code === "admin.account.ownerNotFound"
              ? "Der gewählte Owner-User wurde nicht gefunden."
              : (body?.error ?? `Fehler: HTTP ${res.status}`);
        setError(msg);
        return;
      }

      // SWR-Invalidierung aller Accounts-Listen.
      await mutate(
        (key) =>
          typeof key === "string" && key.startsWith("/api/admin/accounts?"),
        undefined,
        { revalidate: true },
      );

      toast.success(`Team-Account "${name.trim()}" angelegt.`);
      onClose();
    } catch (err) {
      console.error("[create-account] submit failed:", err);
      setError("Netzwerk- oder Server-Fehler. Bitte erneut versuchen.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Neuer Team-Account</DialogTitle>
        <DialogDescription>
          Legt einen Team-Account an. Quota-Overrides sind optional und
          werden im Audit-Log festgehalten.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor={nameId}>Team-Name *</Label>
          <Input
            id={nameId}
            type="text"
            autoComplete="off"
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="z.B. Acme Team"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={planId}>Plan</Label>
          <select
            id={planId}
            value={plan}
            onChange={(e) => setPlan(e.target.value as PlanId)}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          >
            {PLAN_OPTIONS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {/* Owner-Zuweisung (optional) */}
        <details
          className="rounded-md border p-3 [&[open]]:space-y-3"
          open={ownerEnabled}
          onToggle={(e) => {
            const isOpen = (e.target as HTMLDetailsElement).open;
            setOwnerEnabled(isOpen);
            if (!isOpen) {
              setOwnerId(null);
              setOwnerEmail("");
              setOwnerSearch("");
            }
          }}
        >
          <summary className="cursor-pointer text-sm font-medium">
            Owner zuweisen (optional)
          </summary>
          <OwnerPicker
            search={ownerSearch}
            onSearch={setOwnerSearch}
            selectedId={ownerId}
            onSelect={(candidate) => {
              setOwnerId(candidate.id);
              setOwnerEmail(candidate.email);
            }}
          />
          {ownerId ? (
            <p className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
              Ausgewählt: <span className="font-mono">{ownerEmail}</span>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Ohne Owner-Zuweisung bleibt der Account &bdquo;orphaned&ldquo; —
              später per Member-Add nachholbar.
            </p>
          )}
        </details>

        {/* Quota-Override (optional) */}
        <details
          className="rounded-md border p-3 [&[open]]:space-y-3"
          open={quotaOpen}
          onToggle={(e) => {
            const isOpen = (e.target as HTMLDetailsElement).open;
            setQuotaOpen(isOpen);
            if (!isOpen) {
              setQuotaBytes("");
              setQuotaFiles("");
              setQuotaNotes("");
            }
          }}
        >
          <summary className="cursor-pointer text-sm font-medium">
            Quota-Overrides (optional)
          </summary>
          <p className="text-xs text-muted-foreground">
            Leer lassen ⇒ Plan-Defaults gelten. Werte sind non-negative
            Ganzzahlen.
          </p>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor={quotaBytesId} className="text-xs">
                Bytes
              </Label>
              <Input
                id={quotaBytesId}
                type="number"
                min={0}
                step={1}
                value={quotaBytes}
                onChange={(e) => setQuotaBytes(e.target.value)}
                placeholder="z.B. 10737418240"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={quotaFilesId} className="text-xs">
                Files
              </Label>
              <Input
                id={quotaFilesId}
                type="number"
                min={0}
                step={1}
                value={quotaFiles}
                onChange={(e) => setQuotaFiles(e.target.value)}
                placeholder="z.B. 5000"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={quotaNotesId} className="text-xs">
                Notes
              </Label>
              <Input
                id={quotaNotesId}
                type="number"
                min={0}
                step={1}
                value={quotaNotes}
                onChange={(e) => setQuotaNotes(e.target.value)}
                placeholder="z.B. 50000"
              />
            </div>
          </div>
        </details>

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submitting}
          >
            Abbrechen
          </Button>
          <Button type="submit" disabled={submitDisabled}>
            {submitting ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : null}
            Anlegen
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

// ── Owner-Picker ──────────────────────────────────────────────────────

function OwnerPicker({
  search,
  onSearch,
  selectedId,
  onSelect,
}: {
  search: string;
  onSearch: (v: string) => void;
  selectedId: string | null;
  onSelect: (candidate: OwnerCandidate) => void;
}) {
  const [options, setOptions] = useState<OwnerCandidate[] | null>(null);
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    let aborted = false;
    const params = new URLSearchParams({ pageSize: "20" });
    if (debounced.trim()) params.set("q", debounced.trim());
    void fetch(`/api/admin/users?${params}`, {
      signal: controller.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as { users: OwnerCandidate[] };
      })
      .then((data) => {
        if (!aborted) setOptions(data.users);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          console.error("[owner-picker]", err);
        }
      });
    return () => {
      aborted = true;
      controller.abort();
    };
  }, [debounced]);

  return (
    <div className="space-y-2">
      <Input
        placeholder="User-Email oder Name suchen…"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        autoComplete="off"
      />
      <div className="max-h-40 overflow-y-auto rounded-md border bg-card">
        {options === null ? (
          <div className="p-3 text-center text-xs text-muted-foreground">
            <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" />
          </div>
        ) : options.length === 0 ? (
          <div className="p-3 text-center text-xs text-muted-foreground">
            Keine User gefunden.
          </div>
        ) : (
          <ul className="divide-y">
            {options.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => onSelect(u)}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60 ${
                    selectedId === u.id ? "bg-muted" : ""
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {u.email}
                  </span>
                  {u.name ? (
                    <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                      {u.name}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
