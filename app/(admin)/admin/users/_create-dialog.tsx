"use client";

import { Check, Copy, Loader2, UserPlus } from "lucide-react";
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
 * Dialog zum manuellen Anlegen eines neuen Users.
 *
 * Der Button rendert direkt im `actions`-Slot von `AdminPageHeader`.
 * Submit triggert POST /api/admin/users; Erfolg-Pfade:
 *
 *   - `magic_link`: Toast „Setup-Mail verschickt an <email>", Dialog
 *     schließt, SWR-Invalidate auf `/api/admin/users*`
 *   - `initial_password`: Der ursprüngliche Dialog schließt und ein
 *     Success-Dialog öffnet, der das Plaintext-Passwort **einmal**
 *     mit Copy-Button zeigt + klare Warnung, dass es nicht mehr
 *     abrufbar ist
 *
 * Kein Admin-Flag im Formular — siehe docs/… Security-Constraint.
 * Owner-Rolle im Team-Select absichtlich gefiltert; kommt nur via
 * Ownership-Transfer.
 */
export function CreateUserButton() {
  const [open, setOpen] = useState(false);
  const [successPassword, setSuccessPassword] = useState<{
    email: string;
    password: string;
  } | null>(null);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="mr-1.5 h-3.5 w-3.5" />
        Neuer User
      </Button>
      <CreateUserDialog
        open={open}
        onOpenChange={setOpen}
        onSuccessPassword={(info) => setSuccessPassword(info)}
      />
      <InitialPasswordDialog
        info={successPassword}
        onClose={() => setSuccessPassword(null)}
      />
    </>
  );
}

// ── Create-User Dialog ─────────────────────────────────────────────────

type SetupMethod = "magic_link" | "initial_password";
type LocaleChoice = "de" | "en" | "auto";
type TeamRole = "admin" | "member" | "viewer";

interface TeamOption {
  id: string;
  name: string;
  memberCount: number;
}

function CreateUserDialog({
  open,
  onOpenChange,
  onSuccessPassword,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccessPassword: (info: { email: string; password: string }) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {/* Form-State nur anlegen, während der Dialog offen ist — so
         *  startet jede Öffnung mit frischem State ohne Reset-Effekt. */}
        {open ? (
          <CreateUserForm
            onClose={() => onOpenChange(false)}
            onSuccessPassword={onSuccessPassword}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function CreateUserForm({
  onClose,
  onSuccessPassword,
}: {
  onClose: () => void;
  onSuccessPassword: (info: { email: string; password: string }) => void;
}) {
  const { mutate } = useSWRConfig();
  const emailId = useId();
  const nameId = useId();
  const pwId = useId();
  const localeId = useId();

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [canCreateTeams, setCanCreateTeams] = useState(true);
  const [locale, setLocale] = useState<LocaleChoice>("de");
  const [setupMethod, setSetupMethod] = useState<SetupMethod>("magic_link");
  const [password, setPassword] = useState("");

  const [teamEnabled, setTeamEnabled] = useState(false);
  const [teamSearch, setTeamSearch] = useState("");
  const [teamAccountId, setTeamAccountId] = useState<string | null>(null);
  const [teamRole, setTeamRole] = useState<TeamRole>("member");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailValid = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), [email]);
  const passwordValid = password.length >= 12;
  const submitDisabled =
    submitting ||
    !emailValid ||
    (setupMethod === "initial_password" && !passwordValid) ||
    (teamEnabled && !teamAccountId);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        email: email.trim(),
        name: name.trim() || undefined,
        canCreateTeams,
        preferredLocale: locale,
        setupMethod:
          setupMethod === "magic_link"
            ? { type: "magic_link" as const }
            : { type: "initial_password" as const, password },
        team:
          teamEnabled && teamAccountId
            ? { accountId: teamAccountId, role: teamRole }
            : undefined,
      };
      const res = await fetch("/api/admin/users", {
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
          code === "admin.user.emailExists"
            ? "Ein User mit dieser Email existiert bereits."
            : code === "admin.user.teamNotFound"
              ? "Team-Account nicht gefunden."
              : code === "admin.user.teamNotTeam"
                ? "Der gewählte Account ist kein Team-Account."
                : (body?.error ?? `Fehler: HTTP ${res.status}`);
        setError(msg);
        return;
      }
      const data = (await res.json()) as {
        userId: string;
        email: string;
        setupMethod: SetupMethod;
        initialPassword: string | null;
      };

      // SWR-Liste(n) invalidieren — matcht alle /api/admin/users?*-Keys.
      await mutate(
        (key) =>
          typeof key === "string" && key.startsWith("/api/admin/users?"),
        undefined,
        { revalidate: true },
      );

      if (data.setupMethod === "initial_password" && data.initialPassword) {
        onClose();
        onSuccessPassword({
          email: data.email,
          password: data.initialPassword,
        });
      } else {
        toast.success(`Setup-Mail verschickt an ${data.email}.`);
        onClose();
      }
    } catch (err) {
      console.error("[create-user] submit failed:", err);
      setError("Netzwerk- oder Server-Fehler. Bitte erneut versuchen.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Neuer User</DialogTitle>
        <DialogDescription>
          Legt einen User manuell an, Email ist auto-verifiziert. Admin-
          Rechte werden später auf der User-Detail-Seite vergeben.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={emailId}>Email *</Label>
            <Input
              id={emailId}
              type="email"
              autoComplete="off"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@firma.de"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={nameId}>Name (optional)</Label>
            <Input
              id={nameId}
              type="text"
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Vorname Nachname"
            />
          </div>

          <div className="flex items-center gap-2 text-sm">
            <input
              id="cct"
              type="checkbox"
              checked={canCreateTeams}
              onChange={(e) => setCanCreateTeams(e.target.checked)}
              className="h-4 w-4"
            />
            <label htmlFor="cct">Kann Teams erstellen</label>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={localeId}>Sprache</Label>
            <select
              id={localeId}
              value={locale}
              onChange={(e) => setLocale(e.target.value as LocaleChoice)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              <option value="de">Deutsch</option>
              <option value="en">English</option>
              <option value="auto">Auto (Browser-Sprache)</option>
            </select>
          </div>

          {/* Setup-Methode */}
          <fieldset className="space-y-2 rounded-md border p-3">
            <legend className="px-1 text-xs font-medium text-muted-foreground">
              Setup-Methode
            </legend>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="setupMethod"
                value="magic_link"
                checked={setupMethod === "magic_link"}
                onChange={() => setSetupMethod("magic_link")}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                <span className="font-medium">Setup-Link per Email</span>
                <span className="block text-xs text-muted-foreground">
                  Empfohlen — User bekommt Mail mit 7-Tage-gültigem Link
                  zum Passwort-Setzen
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="setupMethod"
                value="initial_password"
                checked={setupMethod === "initial_password"}
                onChange={() => setSetupMethod("initial_password")}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                <span className="font-medium">
                  Initial-Passwort manuell setzen
                </span>
                <span className="block text-xs text-muted-foreground">
                  Notfall-Option. Passwort wird einmalig angezeigt, keine
                  Email geht raus
                </span>
              </span>
            </label>
            {setupMethod === "initial_password" ? (
              <div className="space-y-1.5 pt-2">
                <Label htmlFor={pwId}>Initial-Passwort (min. 12 Zeichen)</Label>
                <Input
                  id={pwId}
                  type="text"
                  autoComplete="off"
                  minLength={12}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="min. 12 Zeichen"
                />
                {password.length > 0 && password.length < 12 ? (
                  <p className="text-xs text-destructive">
                    Mindestens 12 Zeichen nötig.
                  </p>
                ) : null}
              </div>
            ) : null}
          </fieldset>

          {/* Team-Option (expandable) */}
          <details
            className="rounded-md border p-3 [&[open]]:space-y-3"
            open={teamEnabled}
            onToggle={(e) => {
              const isOpen = (e.target as HTMLDetailsElement).open;
              setTeamEnabled(isOpen);
              if (!isOpen) setTeamAccountId(null);
            }}
          >
            <summary className="cursor-pointer text-sm font-medium">
              Zu Team hinzufügen (optional)
            </summary>
            <TeamPicker
              search={teamSearch}
              onSearch={setTeamSearch}
              selectedId={teamAccountId}
              onSelect={setTeamAccountId}
            />
            <div className="space-y-1.5">
              <Label>Rolle</Label>
              <select
                value={teamRole}
                onChange={(e) => setTeamRole(e.target.value as TeamRole)}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                <option value="admin">Admin</option>
                <option value="member">Member</option>
                <option value="viewer">Viewer</option>
              </select>
              <p className="text-xs text-muted-foreground">
                Owner-Rolle gibt&apos;s nur via Ownership-Transfer, nicht
                beim Anlegen.
              </p>
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

// ── Team-Picker ────────────────────────────────────────────────────────

function TeamPicker({
  search,
  onSearch,
  selectedId,
  onSelect,
}: {
  search: string;
  onSearch: (v: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [options, setOptions] = useState<TeamOption[] | null>(null);
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    let aborted = false;
    const params = new URLSearchParams({ type: "team", pageSize: "20" });
    if (debounced.trim()) params.set("q", debounced.trim());
    void fetch(`/api/admin/accounts?${params}`, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as { accounts: TeamOption[] };
      })
      .then((data) => {
        if (!aborted) setOptions(data.accounts);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          console.error("[team-picker]", err);
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
        placeholder="Team suchen…"
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
            Keine Teams gefunden.
          </div>
        ) : (
          <ul className="divide-y">
            {options?.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => onSelect(t.id)}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60 ${
                    selectedId === t.id ? "bg-muted" : ""
                  }`}
                >
                  <span className="truncate font-medium">{t.name}</span>
                  <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                    {t.memberCount} Member
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Initial-Password Success Dialog ───────────────────────────────────

function InitialPasswordDialog({
  info,
  onClose,
}: {
  info: { email: string; password: string } | null;
  onClose: () => void;
}) {
  // Kein Reset-Effect nötig — wir rendern nichts, wenn `info === null`,
  // d.h. React unmountet + remountet bei jedem Öffnen mit frischem State.
  const [copied, setCopied] = useState(false);

  if (!info) return null;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>User angelegt — Passwort einmalig</DialogTitle>
          <DialogDescription>
            {info.email} wurde angelegt. Das Initial-Passwort wird nur
            jetzt angezeigt und nirgends gespeichert. Gib es dem User
            sicher weiter (z.B. via 1Password-Share oder Signal).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-md border bg-muted p-3 font-mono text-sm">
            <span className="flex-1 break-all select-all">{info.password}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(info.password);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  toast.error("Konnte nicht in Zwischenablage kopieren.");
                }
              }}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
            Schließt du diesen Dialog, ist das Passwort nicht mehr
            abrufbar. Bei Verlust: Force-Password-Reset auf der
            User-Detail-Seite.
          </p>
        </div>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Verstanden
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
