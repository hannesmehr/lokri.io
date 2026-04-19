"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { EntraSetupCard } from "@/components/sso/entra-setup-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getEntraAdminConsentUrl } from "@/lib/auth/sso-consent";
import type { Locale } from "@/lib/i18n/config";
import { consentTenantMatchesConfig } from "@/lib/teams/sso-config";

interface SsoConfigResponse {
  accountId: string;
  config:
    | {
        provider: "entra";
        enabled: boolean;
        lastVerifiedAt: string | null;
      }
    | {
        provider: "entra";
        tenantId: string;
        allowedDomains: string[];
        enabled: boolean;
        lastVerifiedAt: string | null;
        lastError: string | null;
        createdAt: string;
        updatedAt: string;
      }
    | null;
  permissions: {
    canManage: boolean;
  };
  fallbackAdminStatus: {
    hasAnyNonSsoAdmin: boolean;
    adminCount: number;
    nonSsoAdminCount: number;
  } | null;
}

const fetcher = (url: string) =>
  fetch(url).then(async (r) => {
    const body = (await r.json().catch(() => null)) as SsoConfigResponse | null;
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return body as SsoConfigResponse;
  });

const DOMAIN_REGEX = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatDateTime(value: string | null, locale: Locale) {
  if (!value) return null;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function TeamSsoSection({
  teamId,
  appOrigin,
  publicAppUrl,
  entraClientId,
}: {
  teamId: string;
  appOrigin: string;
  publicAppUrl: string;
  entraClientId: string | null;
}) {
  const t = useTranslations("team.security.sso");
  const locale = useLocale() as Locale;
  const { data, error, isLoading, mutate } = useSWR<SsoConfigResponse>(
    `/api/teams/${teamId}/sso`,
    fetcher,
    { refreshInterval: 0, revalidateOnFocus: false },
  );

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("sectionTitle")}</CardTitle>
          <CardDescription>{t("ownerDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("placeholder")}</p>
        </CardContent>
      </Card>
    );
  }

  if (!data || isLoading) {
    return (
      <Card data-testid="team-sso-card" data-view="loading">
        <CardHeader>
          <CardTitle>{t("sectionTitle")}</CardTitle>
          <CardDescription>{t("ownerDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("placeholder")}
        </CardContent>
      </Card>
    );
  }

  if (!data.permissions.canManage && !data.config) {
    return (
      <Card data-testid="team-sso-card" data-view="empty">
        <CardHeader>
          <CardTitle>{t("sectionTitle")}</CardTitle>
          <CardDescription>{t("readonlyDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="rounded-lg border border-dashed bg-muted/30 p-6">
          <p className="font-medium">{t("notConfiguredTitle")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("notConfiguredDescription")}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!data.permissions.canManage) {
    return <ReadonlySsoCard data={data} />;
  }

  return (
    <OwnerSsoForm
      key={JSON.stringify(data.config ?? null)}
      data={data}
      locale={locale}
      onMutated={() => void mutate()}
      appOrigin={appOrigin}
      publicAppUrl={publicAppUrl}
      entraClientId={entraClientId}
    />
  );
}

function ReadonlySsoCard({ data }: { data: SsoConfigResponse }) {
  const t = useTranslations("team.security.sso");
  const locale = useLocale() as Locale;
  const statusKey = !data.config
    ? "statusNotConfigured"
    : data.config.enabled
      ? "statusActive"
      : "statusDisabled";

  return (
    <Card data-testid="team-sso-card" data-view="readonly">
      <CardHeader className="space-y-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          <CardTitle>{t("sectionTitle")}</CardTitle>
          <StatusBadge label={t(statusKey)} active={data.config?.enabled ?? false} />
        </div>
        <CardDescription>{t("readonlyDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-foreground">
          {data.config?.enabled ? t("readonly.ssoActive") : t("readonly.ssoDisabled")}
        </p>
        {data.config?.lastVerifiedAt ? (
          <p className="font-mono text-xs text-muted-foreground">
            {t("form.lastVerifiedAt")}: {formatDateTime(data.config.lastVerifiedAt, locale)}
          </p>
        ) : null}
        <p className="text-muted-foreground">{t("readonly.cannotChange")}</p>
      </CardContent>
    </Card>
  );
}

function OwnerSsoForm({
  data,
  locale,
  onMutated,
  appOrigin,
  publicAppUrl,
  entraClientId,
}: {
  data: SsoConfigResponse;
  locale: Locale;
  onMutated: () => void;
  appOrigin: string;
  publicAppUrl: string;
  entraClientId: string | null;
}) {
  const t = useTranslations("team.security.sso");
  const tErrors = useTranslations("errors.api.sso");
  const tToasts = useTranslations("toasts");
  const router = useRouter();
  const params = useSearchParams();
  const tenantIdId = useId();
  const domainInputId = useId();

  const config =
    data.config && "tenantId" in data.config ? data.config : null;
  const fallbackAdminStatus = data.fallbackAdminStatus;

  const [enabled, setEnabled] = useState(config?.enabled ?? false);
  const [tenantId, setTenantId] = useState(config?.tenantId ?? "");
  const [domains, setDomains] = useState(config?.allowedDomains ?? []);
  const [newDomain, setNewDomain] = useState("");
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handledConsentReturn = useRef(false);

  const tenantValid = UUID_REGEX.test(tenantId);
  const domainsValid = domains.length >= 1 && domains.length <= 10;
  const noFallbackAdmin = !fallbackAdminStatus?.hasAnyNonSsoAdmin;
  const enableBlockedByFallback = enabled && noFallbackAdmin;
  const canSave =
    tenantValid && domainsValid && !saving && !enableBlockedByFallback;

  const consentUrl = useMemo(() => {
    if (!tenantValid || !entraClientId) return null;
    try {
      return getEntraAdminConsentUrl(tenantId.trim(), {
        clientId: entraClientId,
        appOrigin,
      });
    } catch {
      return null;
    }
  }, [appOrigin, entraClientId, tenantId, tenantValid]);
  const callbackUrl = `${publicAppUrl}/api/auth/sso/callback`;

  const statusKey = !config
    ? "statusNotConfigured"
    : config.enabled
      ? "statusActive"
      : "statusDisabled";

  const resolveErrorMessage = useCallback((
    body: { error?: string; details?: { code?: string } } | null | undefined,
    fallback: string,
  ) => {
    const suffix =
      typeof body?.details?.code === "string"
        ? body.details.code.split(".").pop() ?? null
        : null;
    return suffix && tErrors.has(suffix)
      ? tErrors(suffix)
      : body?.error ?? fallback;
  }, [tErrors]);

  function addDomain() {
    const domain = newDomain.trim().toLowerCase();
    if (!domain) return;
    if (!DOMAIN_REGEX.test(domain)) {
      setError(t("form.invalidDomain"));
      return;
    }
    if (domains.includes(domain)) {
      setError(t("form.duplicateDomain"));
      return;
    }
    if (domains.length >= 10) {
      setError(t("form.tooManyDomains"));
      return;
    }
    setDomains([...domains, domain]);
    setNewDomain("");
    setError(null);
  }

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/teams/${data.accountId}/sso`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: tenantId.trim(),
          allowedDomains: domains,
          enabled,
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { error?: string; details?: { code?: string } }
        | null;
      if (!res.ok) {
        setError(resolveErrorMessage(body, tToasts("error.generic")));
        return;
      }
      toast.success(t("toasts.saved"));
      onMutated();
    } catch (err) {
      console.error("[team-sso.save]", err);
      setError(tToasts("error.networkFailed"));
    } finally {
      setSaving(false);
    }
  }

  const verify = useCallback(async () => {
    setError(null);
    setVerifying(true);
    try {
      const res = await fetch(`/api/teams/${data.accountId}/sso/verify`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => null)) as
        | { verifiedAt: string | null; error: string | null }
        | { error?: string; details?: { code?: string } }
        | null;
      if (!res.ok) {
        setError(resolveErrorMessage(body as never, t("toasts.verifyFailed")));
        return false;
      }
      if ("error" in (body ?? {}) && body?.error) {
        toast.error(`${t("toasts.verifyFailed")} ${body.error}`);
        onMutated();
        return false;
      }
      toast.success(t("toasts.verifySuccess"));
      onMutated();
      return true;
    } catch (err) {
      console.error("[team-sso.verify]", err);
      setError(tToasts("error.networkFailed"));
      return false;
    } finally {
      setVerifying(false);
    }
  }, [data.accountId, onMutated, resolveErrorMessage, t, tToasts]);

  const verifyFromConsentReturn = useCallback(async () => {
    try {
      const res = await fetch(`/api/teams/${data.accountId}/sso/verify`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => null)) as
        | { verifiedAt: string | null; error: string | null }
        | { error?: string; details?: { code?: string } }
        | null;
      if (!res.ok) {
        toast.error(resolveErrorMessage(body as never, t("toasts.consentFailed")));
        return false;
      }
      if ("error" in (body ?? {}) && body?.error) {
        toast.error(`${t("toasts.consentFailed")} ${body.error}`);
        onMutated();
        return false;
      }
      onMutated();
      return true;
    } catch (err) {
      console.error("[team-sso.verify-consent]", err);
      toast.error(tToasts("error.networkFailed"));
      return false;
    }
  }, [data.accountId, onMutated, resolveErrorMessage, t, tToasts]);

  async function removeConfig() {
    if (!confirm(t("dialogs.removeDescription"))) return;
    setError(null);
    setRemoving(true);
    try {
      const res = await fetch(`/api/teams/${data.accountId}/sso`, {
        method: "DELETE",
      });
      const body = (await res.json().catch(() => null)) as
        | { error?: string; details?: { code?: string } }
        | null;
      if (!res.ok) {
        setError(resolveErrorMessage(body, tToasts("error.generic")));
        return;
      }
      toast.success(t("toasts.removed"));
      onMutated();
    } catch (err) {
      console.error("[team-sso.remove]", err);
      setError(tToasts("error.networkFailed"));
    } finally {
      setRemoving(false);
    }
  }

  async function copyConsentLink() {
    if (!consentUrl) return;
    try {
      await navigator.clipboard.writeText(consentUrl);
      toast.success(t("adminConsent.linkCopied"));
    } catch (err) {
      console.error("[team-sso.copy-consent]", err);
      toast.error(tToasts("error.generic"));
    }
  }

  useEffect(() => {
    if (handledConsentReturn.current) return;
    if (params.get("consent") !== "returned") return;
    handledConsentReturn.current = true;

    const returnedTenant = params.get("tenant");
    const consentOk = params.get("admin_consent") === "True";
    const providerError = params.get("error");

    const clearParams = () => router.replace("/team/security");

    if (providerError) {
      toast.error(t("toasts.consentFailed"));
      clearParams();
      return;
    }

    if (!consentOk) {
      clearParams();
      return;
    }

    if (!consentTenantMatchesConfig(config?.tenantId, returnedTenant)) {
      toast.error(t("adminConsent.tenantMismatch"));
      clearParams();
      return;
    }

    void verifyFromConsentReturn().then((ok) => {
      if (ok) {
        toast.success(t("toasts.consentSuccess"));
      } else {
        toast.error(t("toasts.consentFailed"));
      }
      clearParams();
    });
  }, [config?.tenantId, params, router, t, verifyFromConsentReturn]);

  return (
    <Card data-testid="team-sso-card" data-view="owner">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>{t("sectionTitle")}</CardTitle>
              <StatusBadge label={t(statusKey)} active={config?.enabled ?? false} />
            </div>
            <CardDescription>{t("ownerDescription")}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <EntraSetupCard
          title={t("setup.title")}
          description={t("setup.description")}
          callbackLabel={t("setup.callbackLabel")}
          callbackUrl={callbackUrl}
          supportedAccountTypesLabel={t("setup.supportedAccountTypesLabel")}
          supportedAccountTypesValue={t("setup.supportedAccountTypesValue")}
          clientIdLabel={t("setup.clientIdLabel")}
          clientId={entraClientId}
          copyLabel={t("setup.copyCallback")}
          copiedLabel={t("setup.callbackCopied")}
        />

        <div className="rounded-lg border-l-2 border-brand bg-muted p-4">
          <div className="space-y-2">
            <p className="font-medium">{t("adminConsent.heading")}</p>
            {config?.lastVerifiedAt && !config.lastError ? (
              <p className="text-sm text-muted-foreground">
                {t("adminConsent.completed")}{" "}
                <span className="font-mono text-xs">
                  {formatDateTime(config.lastVerifiedAt, locale)}
                </span>
              </p>
            ) : consentUrl ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {t("adminConsent.description")}
                </p>
                <div className="flex flex-col gap-3 rounded-md border bg-background p-3">
                  <code className="break-all font-mono text-xs text-muted-foreground">
                    {consentUrl}
                  </code>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={copyConsentLink}
                    >
                      <Copy className="mr-1.5 h-3.5 w-3.5" />
                      {t("adminConsent.copyLink")}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      {t("adminConsent.verifyHint")}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("adminConsent.emptyTenantHint")}
              </p>
            )}
          </div>
        </div>

        <div className="rounded-lg border p-4">
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              <span className="font-medium">{t("form.enabledLabel")}</span>
              <span className="block text-muted-foreground">
                {t("form.enabledHint")}
              </span>
            </span>
          </label>

          {enableBlockedByFallback ? (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{t("fallbackAdmin.blocking")}</span>
            </div>
          ) : enabled && fallbackAdminStatus?.nonSsoAdminCount === 1 ? (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{t("fallbackAdmin.warning")}</span>
            </div>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={tenantIdId}>{t("form.tenantIdLabel")}</Label>
          <Input
            id={tenantIdId}
            value={tenantId}
            onChange={(event) => setTenantId(event.target.value)}
            placeholder={t("form.tenantIdPlaceholder")}
            autoComplete="off"
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">{t("form.tenantIdHint")}</p>
          {tenantId && !tenantValid ? (
            <p className="text-xs text-destructive">{t("form.tenantIdInvalid")}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label>{t("form.allowedDomainsLabel")}</Label>
          <p className="text-xs text-muted-foreground">
            {t("form.allowedDomainsHint")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {domains.map((domain) => (
              <span
                key={domain}
                className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-xs"
              >
                <span className="font-mono">{domain}</span>
                <button
                  type="button"
                  onClick={() => setDomains(domains.filter((entry) => entry !== domain))}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={domain}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {domains.length === 0 ? (
              <span className="text-xs text-muted-foreground">
                {t("form.domainsEmpty")}
              </span>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Input
              id={domainInputId}
              value={newDomain}
              onChange={(event) => setNewDomain(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === ",") {
                  event.preventDefault();
                  addDomain();
                }
              }}
              placeholder={t("form.domainPlaceholder")}
              autoComplete="off"
            />
            <Button type="button" variant="outline" size="sm" onClick={addDomain}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              {t("actions.addDomain")}
            </Button>
          </div>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <div className="space-y-1 text-xs text-muted-foreground">
            <div>
              {t("form.lastVerifiedAt")}:{" "}
              <span className="font-mono">
                {config?.lastVerifiedAt
                  ? formatDateTime(config.lastVerifiedAt, locale)
                  : t("form.neverVerified")}
              </span>
            </div>
            {config?.lastError ? (
              <div className="text-destructive">
                {t("form.lastError")}: {config.lastError}
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {config ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void verify()}
                  disabled={verifying}
                >
                  {verifying ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {verifying ? t("actions.verifying") : t("actions.verify")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void removeConfig()}
                  disabled={removing}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  {removing ? t("actions.removing") : t("actions.remove")}
                </Button>
              </>
            ) : null}
            <Button type="button" onClick={() => void save()} disabled={!canSave}>
              {saving ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : null}
              {saving ? t("actions.saving") : t("actions.save")}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({
  label,
  active,
}: {
  label: string;
  active: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
        active
          ? "border-brand/40 bg-brand/10 text-brand"
          : "bg-muted text-foreground"
      }`}
    >
      {active ? <CheckCircle2 className="h-3 w-3" /> : null}
      {label}
    </span>
  );
}
