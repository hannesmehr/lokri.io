"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SpaceOption {
  id: string;
  name: string;
}

type Role = "owner" | "admin" | "member" | "viewer";

export function TokenCreateDialog({
  spaces,
  accountType,
  role,
}: {
  spaces: SpaceOption[];
  accountType: "personal" | "team";
  role: Role;
}) {
  const router = useRouter();
  const t = useTranslations("settings.mcp.create");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [readOnly, setReadOnly] = useState(false);
  const [scopeMode, setScopeMode] = useState<"all" | "selected">("all");
  const [scopeType, setScopeType] = useState<"personal" | "team">("personal");
  const [selectedSpaces, setSelectedSpaces] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [plaintext, setPlaintext] = useState<string | null>(null);

  // Only team accounts expose the choice; only owner/admin may mint
  // team-scoped tokens. Members/viewers silently get personal-scope.
  const canPickTeamScope =
    accountType === "team" && (role === "owner" || role === "admin");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (scopeMode === "selected" && selectedSpaces.size === 0) {
      toast.error(t("errors.selectAtLeastOne"));
      return;
    }
    setLoading(true);
    const payload: Record<string, unknown> = {
      name,
      read_only: readOnly,
      scope_type: scopeType,
    };
    if (scopeMode === "selected") {
      payload.space_scope = [...selectedSpaces];
    }
    const res = await fetch("/api/tokens", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Fehler" }));
      toast.error(data.error || "Konnte Token nicht erstellen.");
      return;
    }
    const { token } = await res.json();
    setPlaintext(token.plaintext);
    router.refresh();
  }

  function closeAndReset() {
    setOpen(false);
    setPlaintext(null);
    setName("");
    setReadOnly(false);
    setScopeMode("all");
    setSelectedSpaces(new Set());
  }

  function toggleSpace(id: string) {
    setSelectedSpaces((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function copyToClipboard() {
    if (!plaintext) return;
    void navigator.clipboard.writeText(plaintext);
    toast.success("Token kopiert.");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) closeAndReset();
        else setOpen(true);
      }}
    >
      <DialogTrigger render={<Button>Neuer Token</Button>} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {plaintext ? "Token erstellt" : "Neuer MCP-Token"}
          </DialogTitle>
          <DialogDescription>
            {plaintext
              ? "Kopiere den Token jetzt — er wird danach nicht mehr angezeigt."
              : "Gib dem Token einen Namen und entscheide, welchen Zugriff der Client bekommt."}
          </DialogDescription>
        </DialogHeader>

        {plaintext ? (
          <div className="space-y-4">
            <Alert>
              <AlertTitle>Nur einmal sichtbar</AlertTitle>
              <AlertDescription>
                Nach dem Schließen kann dieser Token nicht erneut angezeigt
                werden. Speichere ihn in deiner KI-Client-Konfiguration oder
                einem Passwortmanager.
              </AlertDescription>
            </Alert>
            <pre className="rounded-md border bg-muted/50 p-3 text-xs break-all whitespace-pre-wrap">
              {plaintext}
            </pre>
            <DialogFooter className="gap-2">
              <Button type="button" onClick={copyToClipboard}>
                In Zwischenablage kopieren
              </Button>
              <Button type="button" variant="outline" onClick={closeAndReset}>
                Schließen
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="token-name">Name</Label>
              <Input
                id="token-name"
                required
                maxLength={100}
                placeholder="z.B. Claude Desktop"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="off"
              />
            </div>

            {/* Scope --------------------------------------------------- */}
            <div className="space-y-2">
              <Label>Sichtbarkeit</Label>
              <div className="flex gap-1 rounded-lg border bg-muted/40 p-1 text-xs">
                <ScopeTab
                  active={scopeMode === "all"}
                  onClick={() => setScopeMode("all")}
                  label="Alle Spaces"
                  hint="voller Account-Zugriff"
                />
                <ScopeTab
                  active={scopeMode === "selected"}
                  onClick={() => setScopeMode("selected")}
                  label="Nur ausgewählte"
                  hint={
                    spaces.length === 0
                      ? "noch keine Spaces"
                      : `${spaces.length} verfügbar`
                  }
                />
              </div>
              {scopeMode === "selected" ? (
                spaces.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Du hast noch keine Spaces angelegt. Erstelle zuerst einen
                    Space, damit du ihn hier zuweisen kannst.
                  </p>
                ) : (
                  <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
                    {spaces.map((s) => (
                      <label
                        key={s.id}
                        className="flex items-center gap-2 rounded px-2 py-1 text-sm transition-colors hover:bg-muted/50"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={selectedSpaces.has(s.id)}
                          onChange={() => toggleSpace(s.id)}
                        />
                        <span className="truncate">{s.name}</span>
                      </label>
                    ))}
                  </div>
                )
              ) : null}
            </div>

            {canPickTeamScope ? (
              <div className="space-y-2">
                <Label>{t("scopeTypeTitle")}</Label>
                <div className="flex gap-1 rounded-lg border bg-muted/40 p-1 text-xs">
                  <ScopeTypeTab
                    active={scopeType === "personal"}
                    onClick={() => setScopeType("personal")}
                    label={t("scopeTypePersonal")}
                    hint={t("scopeTypePersonalHint")}
                  />
                  <ScopeTypeTab
                    active={scopeType === "team"}
                    onClick={() => setScopeType("team")}
                    label={t("scopeTypeTeam")}
                    hint={t("scopeTypeTeamHint")}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {t("scopeTypeNote")}
                </p>
              </div>
            ) : null}

            {/* Read-only ---------------------------------------------- */}
            <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4"
                checked={readOnly}
                onChange={(e) => setReadOnly(e.target.checked)}
              />
              <div>
                <div className="font-medium">Read-only</div>
                <div className="text-xs text-muted-foreground">
                  Der Client kann lesen & suchen, aber nichts anlegen,
                  verändern oder löschen.
                </div>
              </div>
            </label>

            <DialogFooter>
              <Button type="submit" disabled={loading || !name}>
                {loading ? "Erstellen…" : "Token erstellen"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Small tab-style pair used for scope-type (personal/team) selector. */
function ScopeTypeTab({
  active,
  onClick,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "flex flex-1 flex-col items-start gap-0.5 rounded-md bg-background px-3 py-2 shadow-sm"
          : "flex flex-1 flex-col items-start gap-0.5 rounded-md px-3 py-2 text-muted-foreground transition-colors hover:text-foreground"
      }
    >
      <span className="font-medium">{label}</span>
      <span className="text-[11px] text-muted-foreground">{hint}</span>
    </button>
  );
}

function ScopeTab({
  active,
  onClick,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "flex flex-1 flex-col items-start gap-0.5 rounded-md bg-background px-3 py-2 shadow-sm"
          : "flex flex-1 flex-col items-start gap-0.5 rounded-md px-3 py-2 text-muted-foreground transition-colors hover:text-foreground"
      }
    >
      <span className="font-medium">{label}</span>
      <span className="text-[11px] text-muted-foreground">{hint}</span>
    </button>
  );
}
