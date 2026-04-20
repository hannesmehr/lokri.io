"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

/**
 * Space-Mapping-Card.
 *
 * Liste aller Mappings dieser Integration. Actions:
 *   - "Mapping hinzufügen" → Modal mit Dropdowns für Scope + lokri-Space.
 *     MVP-1:1-Constraint: bereits gemappte Scopes sind im Dropdown
 *     disabled.
 *   - "Entfernen" pro Row → DELETE-Call mit sofortiger toast-
 *     Bestätigung, router.refresh() lädt das Parent-Server-Render neu.
 */

interface InitialMapping {
  id: string;
  scopeId: string;
  scopeIdentifier: string;
  scopeDisplayName: string | null;
  spaceId: string;
  spaceName: string;
}

interface ScopeOption {
  id: string;
  scopeIdentifier: string;
  displayName: string | null;
}

interface TeamSpace {
  id: string;
  name: string;
}

export function ConnectorMappingsManager({
  teamId,
  integrationId,
  initialMappings,
  allScopes,
  teamSpaces,
}: {
  teamId: string;
  integrationId: string;
  initialMappings: InitialMapping[];
  allScopes: ScopeOption[];
  teamSpaces: TeamSpace[];
}) {
  const t = useTranslations("team.connectors.detail");
  const tErrors = useTranslations("team.connectors.errors");
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [selectedScope, setSelectedScope] = useState("");
  const [selectedSpace, setSelectedSpace] = useState("");
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Scopes die bereits gemappt sind — im Dropdown grayed-out.
  const mappedScopeIdentifiers = new Set(
    initialMappings.map((m) => m.scopeIdentifier),
  );

  async function addMapping() {
    setAdding(true);
    setError(null);
    const res = await fetch(
      `/api/teams/${teamId}/connectors/${integrationId}/mappings`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          space_id: selectedSpace,
          scope_identifier: selectedScope,
        }),
      },
    );
    setAdding(false);
    if (!res.ok) {
      setError(await extractMsg(res, tErrors));
      return;
    }
    toast.success(t("mappingsAdded"));
    setOpen(false);
    setSelectedScope("");
    setSelectedSpace("");
    router.refresh();
  }

  async function removeMapping(mappingId: string) {
    setDeletingId(mappingId);
    const res = await fetch(
      `/api/teams/${teamId}/connectors/${integrationId}/mappings/${mappingId}`,
      { method: "DELETE" },
    );
    setDeletingId(null);
    if (!res.ok) {
      toast.error(await extractMsg(res, tErrors));
      return;
    }
    toast.success(t("mappingsRemoved"));
    router.refresh();
  }

  const canAdd = allScopes.length > 0 && teamSpaces.length > 0;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle>{t("mappingsTitle")}</CardTitle>
              <CardDescription>{t("mappingsDescription")}</CardDescription>
            </div>
            {canAdd ? (
              <Button onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" />
                {t("mappingsAddCta")}
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {initialMappings.length === 0 ? (
            <p className="rounded bg-muted p-3 text-sm text-muted-foreground">
              {allScopes.length === 0
                ? t("mappingsNoScopes")
                : teamSpaces.length === 0
                  ? t("mappingsNoSpaces")
                  : t("mappingsEmpty")}
            </p>
          ) : (
            <ul className="divide-y rounded border">
              {initialMappings.map((m) => (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {m.scopeDisplayName ?? m.scopeIdentifier}
                    </div>
                    <div className="truncate font-mono text-xs text-muted-foreground">
                      {m.scopeIdentifier}
                    </div>
                  </div>
                  <span className="text-muted-foreground">→</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{m.spaceName}</div>
                    <div className="truncate font-mono text-xs text-muted-foreground">
                      {m.spaceId.slice(0, 8)}…
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeMapping(m.id)}
                    disabled={deletingId === m.id}
                    aria-label={t("mappingsRemoveCta")}
                  >
                    {deletingId === m.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("mappingsAddTitle")}</DialogTitle>
            <DialogDescription>
              {t("mappingsAddDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="scope-select">
                {t("mappingsScopeLabel")}
              </Label>
              <select
                id="scope-select"
                className="w-full rounded border bg-background px-2 py-2 text-sm"
                value={selectedScope}
                onChange={(e) => setSelectedScope(e.target.value)}
              >
                <option value="">{t("mappingsChooseScope")}</option>
                {allScopes.map((scope) => {
                  const disabled = mappedScopeIdentifiers.has(
                    scope.scopeIdentifier,
                  );
                  const label = scope.displayName
                    ? `${scope.displayName} · ${scope.scopeIdentifier}`
                    : scope.scopeIdentifier;
                  return (
                    <option
                      key={scope.scopeIdentifier}
                      value={scope.scopeIdentifier}
                      disabled={disabled}
                    >
                      {label}
                      {disabled ? ` · ${t("mappingsAlreadyMapped")}` : ""}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="space-select">
                {t("mappingsSpaceLabel")}
              </Label>
              <select
                id="space-select"
                className="w-full rounded border bg-background px-2 py-2 text-sm"
                value={selectedSpace}
                onChange={(e) => setSelectedSpace(e.target.value)}
              >
                <option value="">{t("mappingsChooseSpace")}</option>
                {teamSpaces.map((space) => (
                  <option key={space.id} value={space.id}>
                    {space.name}
                  </option>
                ))}
              </select>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={adding}
            >
              {t("mappingsCancel")}
            </Button>
            <Button
              onClick={addMapping}
              disabled={adding || !selectedScope || !selectedSpace}
            >
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {adding ? t("mappingsAdding") : t("mappingsAddSubmit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

async function extractMsg(
  res: Response,
  tErrors: ReturnType<typeof useTranslations>,
): Promise<string> {
  try {
    const body = (await res.json()) as {
      details?: { code?: string; message?: string };
      error?: string;
    };
    const code = body?.details?.code;
    if (code) {
      try {
        return tErrors(code as never);
      } catch {
        // fall through
      }
    }
    return body?.details?.message ?? body?.error ?? res.statusText;
  } catch {
    return res.statusText;
  }
}
