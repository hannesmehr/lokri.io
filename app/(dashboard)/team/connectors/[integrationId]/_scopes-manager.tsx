"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
import { Input } from "@/components/ui/input";

/**
 * Scope-Allowlist-Card.
 *
 * Zwei Modi:
 *   - **Read-Mode** (Default): zeigt die bestehenden Scopes als Tabelle
 *     mit mapping-count pro Eintrag + „Scopes aktualisieren"-Button.
 *   - **Edit-Mode**: nach Klick auf „Scopes aktualisieren" läuft ein
 *     `POST /discover` → Checkbox-Liste mit bestehenden Scopes
 *     vorausgewählt. Warnung bei entfernten Scopes, die noch gemappt
 *     sind (cascade würde ein Mapping löschen). Save → `PUT /scopes`
 *     replace-all.
 *
 * Kein Modal — inline state-switch, weil der Edit-Flow vergleichsweise
 * groß ist (Enterprise-Instanzen haben viele Scopes, Modal wäre zu eng).
 */

interface InitialScope {
  id: string;
  scopeType: string;
  scopeIdentifier: string;
  metadata: Record<string, unknown> | null;
  mappingCount: number;
}

interface DiscoveredScope {
  scope_type: string;
  scope_identifier: string;
  scope_metadata: Record<string, unknown> | null;
}

export function ConnectorScopesManager({
  teamId,
  integrationId,
  connectorType,
  initialScopes,
}: {
  teamId: string;
  integrationId: string;
  connectorType: string;
  initialScopes: InitialScope[];
}) {
  const t = useTranslations("team.connectors.detail");
  const tErrors = useTranslations("team.connectors.errors");
  const router = useRouter();

  const [mode, setMode] = useState<"read" | "edit">("read");
  const [loading, setLoading] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredScope[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const initialIdentifiers = new Set(
    initialScopes.map((s) => s.scopeIdentifier),
  );

  async function startEdit() {
    setLoading(true);
    const res = await fetch(
      `/api/teams/${teamId}/connectors/${integrationId}/discover`,
      { method: "POST" },
    );
    setLoading(false);
    if (!res.ok) {
      let msg: string;
      try {
        const body = (await res.json()) as {
          details?: { code?: string; message?: string };
        };
        msg = body.details?.code
          ? (() => {
              try {
                return tErrors(body.details.code as never);
              } catch {
                return body.details?.message ?? res.statusText;
              }
            })()
          : res.statusText;
      } catch {
        msg = res.statusText;
      }
      toast.error(msg);
      return;
    }
    const data = (await res.json()) as { scopes: DiscoveredScope[] };
    setDiscovered(data.scopes);
    // Vorauswählen: aktuelle Allowlist
    setSelected(new Set(initialIdentifiers));
    setMode("edit");
  }

  const filtered = search
    ? discovered.filter((d) => {
        const name =
          (d.scope_metadata as { displayName?: string } | null)
            ?.displayName ?? "";
        return (
          d.scope_identifier.toLowerCase().includes(search.toLowerCase()) ||
          name.toLowerCase().includes(search.toLowerCase())
        );
      })
    : discovered;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Scopes die entfernt werden UND ein Mapping haben (cascade-warn)
  const cascadedMappingCount = initialScopes
    .filter(
      (s) =>
        !selected.has(s.scopeIdentifier) && s.mappingCount > 0,
    )
    .reduce((sum, s) => sum + s.mappingCount, 0);

  async function save() {
    if (selected.size === 0) {
      toast.error(t("scopesAtLeastOne"));
      return;
    }
    setSaving(true);
    const scopes = discovered
      .filter((d) => selected.has(d.scope_identifier))
      .map((d) => ({
        scope_type: d.scope_type,
        scope_identifier: d.scope_identifier,
        scope_metadata: d.scope_metadata,
      }));
    const res = await fetch(
      `/api/teams/${teamId}/connectors/${integrationId}/scopes`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopes }),
      },
    );
    setSaving(false);
    if (!res.ok) {
      let msg: string;
      try {
        const body = (await res.json()) as {
          details?: { code?: string };
        };
        msg = body.details?.code
          ? (() => {
              try {
                return tErrors(body.details.code as never);
              } catch {
                return res.statusText;
              }
            })()
          : res.statusText;
      } catch {
        msg = res.statusText;
      }
      toast.error(msg);
      return;
    }
    toast.success(t("scopesSaved"));
    setMode("read");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>{t("scopesTitle")}</CardTitle>
            <CardDescription>{t("scopesDescription")}</CardDescription>
          </div>
          {mode === "read" ? (
            <Button
              variant="outline"
              onClick={startEdit}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {loading ? t("scopesLoading") : t("scopesRefreshCta")}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {mode === "read" ? (
          initialScopes.length === 0 ? (
            <p className="rounded bg-muted p-3 text-sm text-muted-foreground">
              {t("scopesEmpty")}
            </p>
          ) : (
            <ul className="divide-y rounded border">
              {initialScopes.map((s) => {
                const name =
                  (s.metadata as { displayName?: string } | null)
                    ?.displayName ?? s.scopeIdentifier;
                return (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{name}</div>
                      <div className="truncate font-mono text-xs text-muted-foreground">
                        {s.scopeIdentifier}
                      </div>
                    </div>
                    <span
                      className={`text-xs ${
                        s.mappingCount > 0
                          ? "text-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      {t("scopesMappingCount", { count: s.mappingCount })}
                    </span>
                  </li>
                );
              })}
            </ul>
          )
        ) : (
          <>
            <Input
              type="search"
              placeholder={t("scopesSearchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="max-h-[360px] space-y-1 overflow-y-auto rounded border p-3">
              {filtered.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  {t("scopesNoMatches")}
                </p>
              ) : (
                filtered.map((d) => {
                  const checked = selected.has(d.scope_identifier);
                  const name =
                    (d.scope_metadata as { displayName?: string } | null)
                      ?.displayName ?? d.scope_identifier;
                  const wasInAllowlist = initialIdentifiers.has(
                    d.scope_identifier,
                  );
                  return (
                    <label
                      key={d.scope_identifier}
                      className="flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 hover:bg-muted"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(d.scope_identifier)}
                        className="h-4 w-4"
                      />
                      <span className="flex-1">{name}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {d.scope_identifier}
                      </span>
                      {wasInAllowlist ? (
                        <span className="text-xs text-muted-foreground">
                          {t("scopesCurrent")}
                        </span>
                      ) : null}
                    </label>
                  );
                })
              )}
            </div>
            {cascadedMappingCount > 0 ? (
              <div className="flex items-start gap-2 rounded border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <p>
                  {t("scopesCascadeWarning", {
                    count: cascadedMappingCount,
                  })}
                </p>
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {t("scopesSelectionSummary", {
                count: selected.size,
                total: discovered.length,
              })}
            </p>
            <div className="flex justify-between gap-2">
              <Button
                variant="ghost"
                onClick={() => setMode("read")}
                disabled={saving}
              >
                {t("scopesCancel")}
              </Button>
              <Button
                onClick={save}
                disabled={saving || selected.size === 0}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {saving ? t("scopesSaving") : t("scopesSave")}
              </Button>
            </div>
          </>
        )}
      </CardContent>
      {/* connectorType is reserved for future per-type tooling; suppress unused */}
      <span className="hidden" data-connector-type={connectorType} />
    </Card>
  );
}
