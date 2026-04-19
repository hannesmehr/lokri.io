"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Admin-SSO-Konfigurations-Section für Team-Accounts.
 *
 * Rendert nur, wenn der umschliessende Detail-Client einen
 * Team-Account lädt. Fetched Config + Fallback-Admin-Status über
 * `GET /api/admin/accounts/[id]/sso` (eigener SWR-Key, unabhängig
 * vom Account-Detail-Hauptfetch).
 *
 * State-Modell im UI ist bewusst simpel — nicht zweigeleisig,
 * sondern „Working-Copy + Save". Alle Form-Felder haben lokalen
 * State, den der User manipuliert; beim Speichern geht ein kompletter
 * PUT raus. Kein Dirty-Tracking per Feld, weil die Shape klein ist.
 */

interface SsoConfigResponse {
  accountId: string;
  config: {
    provider: "entra";
    tenantId: string;
    allowedDomains: string[];
    enabled: boolean;
    lastVerifiedAt: string | null;
    lastError: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  fallbackAdminStatus: {
    hasAnyNonSsoAdmin: boolean;
    adminCount: number;
    nonSsoAdminCount: number;
  };
}

const fetcher = (url: string) =>
  fetch(url).then(async (r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as SsoConfigResponse;
  });

const DOMAIN_REGEX = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function SsoSection({ accountId }: { accountId: string }) {
  const { data, error, isLoading, mutate } = useSWR<SsoConfigResponse>(
    `/api/admin/accounts/${accountId}/sso`,
    fetcher,
    { refreshInterval: 0, revalidateOnFocus: false },
  );

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Team-SSO</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">
            SSO-Status konnte nicht geladen werden.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!data || isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Team-SSO</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Lade SSO-Konfiguration…
        </CardContent>
      </Card>
    );
  }

  return (
    <SsoForm
      accountId={accountId}
      initialConfig={data.config}
      fallbackAdminStatus={data.fallbackAdminStatus}
      onMutated={() => void mutate()}
    />
  );
}

function SsoForm({
  accountId,
  initialConfig,
  fallbackAdminStatus,
  onMutated,
}: {
  accountId: string;
  initialConfig: SsoConfigResponse["config"];
  fallbackAdminStatus: SsoConfigResponse["fallbackAdminStatus"];
  onMutated: () => void;
}) {
  const tenantId_ = useId();
  const domainInput_ = useId();

  const [enabled, setEnabled] = useState(initialConfig?.enabled ?? false);
  const [tenantId, setTenantId] = useState(initialConfig?.tenantId ?? "");
  const [domains, setDomains] = useState<string[]>(
    initialConfig?.allowedDomains ?? [],
  );
  const [newDomain, setNewDomain] = useState("");
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tenantValid = UUID_REGEX.test(tenantId);
  const domainsValid = domains.length >= 1 && domains.length <= 10;
  const noFallbackAdmin = !fallbackAdminStatus.hasAnyNonSsoAdmin;
  const enableBlockedByFallback = enabled && noFallbackAdmin;
  const canSave =
    tenantValid && domainsValid && !saving && !enableBlockedByFallback;

  const status: "aktiv" | "konfiguriert" | "keine" = useMemo(() => {
    if (!initialConfig) return "keine";
    return initialConfig.enabled ? "aktiv" : "konfiguriert";
  }, [initialConfig]);

  function addDomain() {
    const d = newDomain.trim().toLowerCase();
    if (!d) return;
    if (!DOMAIN_REGEX.test(d)) {
      setError(`„${d}" ist keine gültige Domain.`);
      return;
    }
    if (domains.includes(d)) {
      setError(`„${d}" ist bereits in der Liste.`);
      return;
    }
    if (domains.length >= 10) {
      setError("Maximal 10 Domains.");
      return;
    }
    setDomains([...domains, d]);
    setNewDomain("");
    setError(null);
  }

  function removeDomain(d: string) {
    setDomains(domains.filter((x) => x !== d));
  }

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/accounts/${accountId}/sso`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: tenantId.trim(),
          allowedDomains: domains,
          enabled,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string; details?: { code?: string } }
          | null;
        const code = body?.details?.code;
        const msg =
          code === "sso.noFallbackAdmin"
            ? "Team braucht einen Fallback-Admin (Email/Passwort-Login), bevor SSO aktiviert werden kann."
            : code === "admin.account.notTeam"
              ? "SSO ist nur für Team-Accounts verfügbar."
              : (body?.error ?? `Fehler: HTTP ${res.status}`);
        setError(msg);
        return;
      }
      toast.success("SSO-Konfiguration gespeichert.");
      onMutated();
    } catch (err) {
      console.error("[sso-section.save]", err);
      setError("Netzwerk- oder Server-Fehler. Bitte erneut versuchen.");
    } finally {
      setSaving(false);
    }
  }

  async function verify() {
    setError(null);
    setVerifying(true);
    try {
      const res = await fetch(
        `/api/admin/accounts/${accountId}/sso/verify`,
        { method: "POST" },
      );
      const body = (await res.json().catch(() => null)) as {
        verifiedAt: string | null;
        error: string | null;
      } | null;
      if (!res.ok || !body) {
        toast.error("Verifikation fehlgeschlagen.");
        return;
      }
      if (body.error) {
        toast.error(`Verifikation fehlgeschlagen: ${body.error}`);
      } else {
        toast.success("Verbindung zum Entra-Tenant erfolgreich.");
      }
      onMutated();
    } catch (err) {
      console.error("[sso-section.verify]", err);
      toast.error("Verifikation fehlgeschlagen.");
    } finally {
      setVerifying(false);
    }
  }

  async function removeConfig() {
    if (
      !confirm(
        "SSO-Konfiguration wirklich entfernen? User-SSO-Identities bleiben bestehen.",
      )
    ) {
      return;
    }
    setError(null);
    setRemoving(true);
    try {
      const res = await fetch(`/api/admin/accounts/${accountId}/sso`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error("Konnte Config nicht entfernen.");
        return;
      }
      toast.success("SSO-Konfiguration entfernt.");
      // Felder zurücksetzen — die Re-Load-Response zeigt dann config: null
      setEnabled(false);
      setTenantId("");
      setDomains([]);
      onMutated();
    } catch (err) {
      console.error("[sso-section.remove]", err);
      toast.error("Fehler beim Entfernen.");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-3">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-brand" />
            Team-SSO
            <StatusBadge status={status} />
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Microsoft Entra ID (OIDC). Aktiviert SSO für User mit
            passender Email-Domain in diesem Team.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {initialConfig ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={verify}
                disabled={verifying}
              >
                {verifying ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                )}
                Verifizieren
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={removeConfig}
                disabled={removing}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Entfernen
              </Button>
            </>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Enable-Toggle + Fallback-Admin-Warnung */}
        <div className="space-y-2 rounded-md border p-3">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              <span className="font-medium">SSO aktivieren</span>
              <span className="block text-xs text-muted-foreground">
                User mit passender Email-Domain loggen sich dann per
                Microsoft-Login ein. User müssen vorab als Team-Member
                eingetragen sein (kein Auto-Provisioning).
              </span>
            </span>
          </label>
          {enableBlockedByFallback ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Dieses Team hat keine Owner oder Admins mit
                Email/Passwort-Login. SSO kann erst aktiviert werden,
                wenn ein Fallback-Admin existiert. Passe Rollen in der
                Members-Section an oder lege einen Admin-User mit
                Initial-Passwort an.
              </span>
            </div>
          ) : enabled && fallbackAdminStatus.nonSsoAdminCount === 1 ? (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Nur ein Fallback-Admin im Team. Bei Sperrung oder
                Ausfall dieses Accounts ist kein Admin-Zugang möglich
                — bitte einen zweiten Admin mit Credential-Login
                bereitstellen.
              </span>
            </div>
          ) : null}
        </div>

        {/* Tenant-ID */}
        <div className="space-y-1.5">
          <Label htmlFor={tenantId_}>Entra Tenant-ID *</Label>
          <Input
            id={tenantId_}
            type="text"
            autoComplete="off"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            placeholder="z.B. 3fa85f64-5717-4562-b3fc-2c963f66afa6"
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            Azure Portal → Microsoft Entra ID → Overview → Tenant ID.
            UUID-Format erforderlich.
          </p>
          {tenantId && !tenantValid ? (
            <p className="text-xs text-destructive">
              Tenant-ID muss eine UUID sein.
            </p>
          ) : null}
        </div>

        {/* Allowed Domains */}
        <div className="space-y-1.5">
          <Label>Erlaubte Email-Domains *</Label>
          <p className="text-xs text-muted-foreground">
            User mit Email aus einer dieser Domains werden beim Login
            auf SSO umgeleitet. Subdomains werden nicht gematcht —
            explizit listen.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {domains.map((d) => (
              <span
                key={d}
                className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-xs"
              >
                <span className="font-mono">{d}</span>
                <button
                  type="button"
                  onClick={() => removeDomain(d)}
                  aria-label={`Domain ${d} entfernen`}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {domains.length === 0 ? (
              <span className="text-xs text-muted-foreground">
                Noch keine Domains
              </span>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Input
              id={domainInput_}
              type="text"
              autoComplete="off"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addDomain();
                }
              }}
              placeholder="z.B. firma-x.de"
              className="text-sm"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={addDomain}
              disabled={!newDomain.trim()}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex items-center justify-between border-t pt-3">
          <StatusFooter config={initialConfig} />
          <Button type="button" onClick={save} disabled={!canSave}>
            {saving ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : null}
            Speichern
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({
  status,
}: {
  status: "aktiv" | "konfiguriert" | "keine";
}) {
  if (status === "aktiv") {
    return (
      <AdminStatusBadge
        variant="success"
        icon={<CheckCircle2 className="h-2.5 w-2.5" />}
      >
        Aktiv
      </AdminStatusBadge>
    );
  }
  if (status === "konfiguriert") {
    return <AdminStatusBadge variant="neutral">Deaktiviert</AdminStatusBadge>;
  }
  return (
    <AdminStatusBadge variant="neutral">Nicht konfiguriert</AdminStatusBadge>
  );
}

function StatusFooter({
  config,
}: {
  config: SsoConfigResponse["config"];
}) {
  if (!config) {
    return (
      <span className="text-xs text-muted-foreground">
        Noch nicht gespeichert
      </span>
    );
  }
  return (
    <div className="space-y-0.5 text-xs text-muted-foreground">
      <div>
        Zuletzt verifiziert:{" "}
        {config.lastVerifiedAt ? (
          <span className="text-foreground">
            {new Date(config.lastVerifiedAt).toLocaleString("de-DE")}
          </span>
        ) : (
          "—"
        )}
      </div>
      {config.lastError ? (
        <div className="text-destructive">
          Letzter Fehler: {config.lastError}
        </div>
      ) : null}
      <div>
        Erstellt {new Date(config.createdAt).toLocaleDateString("de-DE")}, zuletzt
        geändert{" "}
        {new Date(config.updatedAt).toLocaleDateString("de-DE")}
      </div>
    </div>
  );
}

