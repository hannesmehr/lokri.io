"use client";

import {
  AlertTriangle,
  Copy,
  KeyRound,
  Loader2,
  LogOut,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

interface UserData {
  id: string;
  email: string;
  name: string;
  image: string | null;
  emailVerified: boolean;
  isAdmin: boolean;
  canCreateTeams: boolean;
  preferredLocale: string | null;
  disabledAt: string | null;
  createdAt: string;
}
interface AccountRow {
  accountId: string;
  accountName: string;
  accountType: "personal" | "team";
  planId: string;
  role: string;
  joinedAt: string;
}
interface TokenRow {
  id: string;
  name: string;
  tokenPrefix: string;
  scopeType: string | null;
  ownerAccountId: string;
  readOnly: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}
interface SessionRow {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
}

export function UserDetailClient({
  actorId,
  user: initialUser,
  accounts,
  tokens: initialTokens,
  sessions,
}: {
  actorId: string;
  user: UserData;
  accounts: AccountRow[];
  tokens: TokenRow[];
  sessions: SessionRow[];
}) {
  const router = useRouter();
  const isSelf = initialUser.id === actorId;
  const [user, setUser] = useState(initialUser);
  const [tokens, setTokens] = useState(initialTokens);
  const [busy, setBusy] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  async function patch(
    patchBody: Partial<{
      isAdmin: boolean;
      canCreateTeams: boolean;
      preferredLocale: "de" | "en" | null;
      disabled: boolean;
    }>,
    label: string,
  ) {
    setBusy(label);
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patchBody),
    });
    setBusy(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body?.error ?? "Änderung fehlgeschlagen.");
      return;
    }
    toast.success("Gespeichert.");
    // Optimistic local update
    if (patchBody.isAdmin !== undefined) setUser((u) => ({ ...u, isAdmin: patchBody.isAdmin! }));
    if (patchBody.canCreateTeams !== undefined)
      setUser((u) => ({ ...u, canCreateTeams: patchBody.canCreateTeams! }));
    if (patchBody.preferredLocale !== undefined)
      setUser((u) => ({ ...u, preferredLocale: patchBody.preferredLocale ?? null }));
    if (patchBody.disabled !== undefined)
      setUser((u) => ({
        ...u,
        disabledAt: patchBody.disabled ? new Date().toISOString() : null,
      }));
    router.refresh();
  }

  async function forcePasswordReset() {
    setBusy("reset");
    const res = await fetch(
      `/api/admin/users/${user.id}/force-password-reset`,
      { method: "POST" },
    );
    setBusy(null);
    if (!res.ok) {
      toast.error("Reset-Mail konnte nicht versendet werden.");
      return;
    }
    toast.success("Reset-Mail verschickt.");
  }

  async function revokeSessions() {
    if (!confirm("Alle Sessions dieses Users beenden?")) return;
    setBusy("sessions");
    const res = await fetch(`/api/admin/users/${user.id}/revoke-sessions`, {
      method: "POST",
    });
    setBusy(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body?.error ?? "Konnte Sessions nicht beenden.");
      return;
    }
    toast.success("Sessions beendet.");
    router.refresh();
  }

  async function revokeToken(tokenId: string) {
    if (!confirm("Token widerrufen?")) return;
    setBusy(`token:${tokenId}`);
    const res = await fetch(`/api/tokens/${tokenId}`, { method: "DELETE" });
    setBusy(null);
    if (!res.ok) {
      toast.error("Konnte Token nicht widerrufen.");
      return;
    }
    toast.success("Widerrufen.");
    setTokens((ts) =>
      ts.map((t) =>
        t.id === tokenId ? { ...t, revokedAt: new Date().toISOString() } : t,
      ),
    );
  }

  async function hardDelete() {
    if (deleteConfirm !== user.email) {
      toast.error("Email stimmt nicht überein.");
      return;
    }
    setBusy("delete");
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "DELETE",
    });
    setBusy(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body?.error ?? "Löschen fehlgeschlagen.");
      return;
    }
    toast.success(`${user.email} gelöscht.`);
    router.push("/admin/users");
  }

  return (
    <div className="space-y-6">
      {/* Head */}
      <Card>
        <CardContent className="flex flex-wrap items-start gap-4 pt-6">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-lg font-bold text-white">
            {user.name?.[0]?.toUpperCase() ?? user.email[0].toUpperCase()}
          </div>
          <div className="min-w-0 flex-1 space-y-0.5">
            <h2 className="text-xl font-semibold">{user.email}</h2>
            {user.name ? (
              <div className="text-sm text-muted-foreground">{user.name}</div>
            ) : null}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <code className="truncate">{user.id}</code>
              <button
                type="button"
                className="inline-flex items-center gap-1 hover:text-foreground"
                onClick={() => {
                  void navigator.clipboard.writeText(user.id);
                  toast.success("User-ID kopiert.");
                }}
                aria-label="User-ID kopieren"
              >
                <Copy className="h-3 w-3" />
              </button>
            </div>
            <div className="text-xs text-muted-foreground">
              Erstellt {new Date(user.createdAt).toLocaleString("de-DE")}
            </div>
          </div>
          {isSelf ? (
            <span className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-200">
              Du selbst
            </span>
          ) : null}
        </CardContent>
      </Card>

      {/* Flags */}
      <Card>
        <CardHeader>
          <CardTitle>Status & Flags</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleRow
            label="Admin-Berechtigung"
            hint="Zugriff auf den Backoffice-Bereich. Du kannst deinen eigenen Admin-Status nicht entziehen."
            checked={user.isAdmin}
            disabled={isSelf || busy !== null}
            onChange={(v) => patch({ isAdmin: v }, "isAdmin")}
          />
          <ToggleRow
            label="Team-Erstellung erlaubt"
            hint="Beta-Flag: Users mit diesem Flag sehen im Account-Switcher „Team erstellen“."
            checked={user.canCreateTeams}
            disabled={busy !== null}
            onChange={(v) => patch({ canCreateTeams: v }, "canCreateTeams")}
          />
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium">Bevorzugte Sprache</div>
              <div className="text-xs text-muted-foreground">
                Override über Browser-Sprache; bestimmt UI-Sprache + Mail-Locale.
              </div>
            </div>
            <select
              value={user.preferredLocale ?? ""}
              onChange={(e) =>
                void patch(
                  {
                    preferredLocale:
                      e.target.value === ""
                        ? null
                        : (e.target.value as "de" | "en"),
                  },
                  "locale",
                )
              }
              disabled={busy !== null}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              <option value="">Auto (Browser)</option>
              <option value="de">Deutsch</option>
              <option value="en">English</option>
            </select>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-md border border-muted-foreground/20 p-3">
            <div>
              <div className="text-sm font-medium">Email-Verifizierung</div>
              <div className="text-xs text-muted-foreground">
                {user.emailVerified
                  ? "Verifiziert — durch Mail-Klick bestätigt."
                  : "Unverifiziert — User hat den Bestätigungslink nicht angeklickt."}
              </div>
            </div>
            {user.emailVerified ? (
              <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                ✓ verifiziert
              </span>
            ) : (
              <span className="rounded border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
                unverifiziert
              </span>
            )}
          </div>
          <ToggleRow
            label="User gesperrt"
            hint="Setzt disabled_at. Sperrt alle Sessions sofort + blockiert neue Logins. Reversibel."
            checked={user.disabledAt !== null}
            disabled={isSelf || busy !== null}
            onChange={(v) => patch({ disabled: v }, "disabled")}
            danger
          />
        </CardContent>
      </Card>

      {/* Accounts */}
      <Card>
        <CardHeader>
          <CardTitle>Accounts ({accounts.length})</CardTitle>
          <CardDescription>
            Alle owner_accounts, in denen dieser User Mitglied ist.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Keine Accounts — ungewöhnlich, Personal-Account fehlt vermutlich.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 text-left font-medium">Name</th>
                    <th className="py-2 text-left font-medium">Typ</th>
                    <th className="py-2 text-left font-medium">Plan</th>
                    <th className="py-2 text-left font-medium">Rolle</th>
                    <th className="py-2 text-left font-medium">Beigetreten</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {accounts.map((a) => (
                    <tr key={a.accountId}>
                      <td className="py-2">
                        <Link
                          href={`/admin/accounts/${a.accountId}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {a.accountName}
                        </Link>
                      </td>
                      <td className="py-2">
                        <span className="rounded border bg-muted/40 px-1.5 py-0.5 text-[10px]">
                          {a.accountType}
                        </span>
                      </td>
                      <td className="py-2 text-xs">{a.planId}</td>
                      <td className="py-2 text-xs">{a.role}</td>
                      <td className="py-2 text-xs text-muted-foreground">
                        {new Date(a.joinedAt).toLocaleDateString("de-DE")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tokens */}
      <Card>
        <CardHeader>
          <CardTitle>Tokens ({tokens.length})</CardTitle>
          <CardDescription>
            MCP-Tokens, die dieser User erstellt hat.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tokens.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Keine Tokens — User hat nichts gemintet.
            </p>
          ) : (
            <ul className="divide-y">
              {tokens.map((t) => (
                <li
                  key={t.id}
                  className="flex flex-wrap items-center gap-3 py-3"
                >
                  <KeyRound className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{t.name}</span>
                      <code className="text-[11px] text-muted-foreground">
                        {t.tokenPrefix}…
                      </code>
                      {t.scopeType === "team" ? (
                        <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-300">
                          team-wide
                        </span>
                      ) : null}
                      {t.readOnly ? (
                        <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-300">
                          read-only
                        </span>
                      ) : null}
                      {t.revokedAt ? (
                        <span className="rounded border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-700 dark:text-red-300">
                          revoked
                        </span>
                      ) : null}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Erstellt {new Date(t.createdAt).toLocaleDateString("de-DE")}
                      {t.lastUsedAt
                        ? ` · zuletzt ${new Date(t.lastUsedAt).toLocaleString("de-DE")}`
                        : " · nie genutzt"}
                    </div>
                  </div>
                  {!t.revokedAt ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy === `token:${t.id}`}
                      onClick={() => void revokeToken(t.id)}
                    >
                      {busy === `token:${t.id}` ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5" />
                      )}
                      Widerrufen
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Sessions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Sessions ({sessions.length})</CardTitle>
              <CardDescription>
                Aktive Browser-Sessions dieses Users.
              </CardDescription>
            </div>
            {!isSelf && sessions.length > 0 ? (
              <Button
                variant="outline"
                size="sm"
                disabled={busy === "sessions"}
                onClick={() => void revokeSessions()}
              >
                {busy === "sessions" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <LogOut className="h-3.5 w-3.5" />
                )}
                Alle beenden
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Keine aktiven Sessions.
            </p>
          ) : (
            <ul className="divide-y">
              {sessions.map((s) => (
                <li key={s.id} className="py-2 text-sm">
                  <div className="flex flex-wrap items-baseline gap-3">
                    <code className="text-xs">{s.ipAddress ?? "—"}</code>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {s.userAgent ?? "unbekannter Client"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      seit {new Date(s.createdAt).toLocaleString("de-DE")}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            Gefahrenzone
          </CardTitle>
          <CardDescription>
            Aktionen hier sind sichtbar im Audit-Log. Sei sparsam.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="max-w-md text-sm">
              <div className="font-medium">Passwort-Reset erzwingen</div>
              <div className="text-xs text-muted-foreground">
                Schickt dem User einen Reset-Link per Email. Der User
                erfährt nichts davon, dass ein Admin es ausgelöst hat.
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={busy === "reset"}
              onClick={() => void forcePasswordReset()}
            >
              {busy === "reset" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5" />
              )}
              Reset-Mail schicken
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
            <div className="max-w-md text-sm">
              <div className="font-medium">User permanent löschen</div>
              <div className="text-xs text-muted-foreground">
                Entfernt den User, alle seine Personal-Accounts inkl.
                Dateien. Team-Mitgliedschaften werden gelöst, die Teams
                bleiben bestehen. Nicht rückgängig.
              </div>
            </div>
            <Button
              variant="destructive"
              size="sm"
              disabled={isSelf || busy === "delete"}
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              User löschen
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={deleteOpen}
        onOpenChange={(v) => {
          if (!v) {
            setDeleteOpen(false);
            setDeleteConfirm("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>User {user.email} löschen</DialogTitle>
            <DialogDescription>
              Unumkehrbar. Tippe zur Bestätigung die Email-Adresse ein:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="confirm">Email-Adresse</Label>
            <Input
              id="confirm"
              placeholder={user.email}
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              autoComplete="off"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setDeleteOpen(false);
                setDeleteConfirm("");
              }}
              disabled={busy === "delete"}
            >
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={() => void hardDelete()}
              disabled={busy === "delete" || deleteConfirm !== user.email}
            >
              {busy === "delete" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Endgültig löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  disabled,
  onChange,
  danger,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  danger?: boolean;
}) {
  return (
    <label
      className={
        "flex items-center justify-between gap-4 rounded-md border p-3" +
        (danger ? " border-destructive/30 bg-destructive/5" : "")
      }
    >
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4"
      />
    </label>
  );
}
