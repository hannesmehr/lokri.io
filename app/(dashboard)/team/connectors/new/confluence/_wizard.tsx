"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Confluence-Setup-Wizard — Client-Component mit internem Multi-Step-
 * State.
 *
 * Vier Steps:
 *   1. Credentials (email, apiToken, siteUrl) → `POST /validate`
 *      liefert diagnostics + scopes
 *   2. Scope-Auswahl (Checkbox-Liste aus /validate-Response)
 *   3. Optionale Space-Mappings (Team-Spaces × ausgewählte Scopes)
 *   4. Confirmation → `POST /connectors` atomar
 *
 * State ist local (kein localStorage, kein URL-State) — Browser-Refresh
 * verliert alles, das ist MVP-accepted. Credentials sind kurz genug
 * zum erneuten Eingeben; Scopes werden beim nächsten Retry über
 * `/validate` wiederhergestellt.
 */

interface TeamSpace {
  id: string;
  name: string;
}

interface DiscoveredScope {
  scope_type: string;
  scope_identifier: string;
  scope_metadata: Record<string, unknown> | null;
}

interface Diagnostics {
  accountId?: string;
  email?: string | null;
  publicName?: string | null;
  displayName?: string | null;
  apiVersion?: string;
  [k: string]: unknown;
}

type Step = 1 | 2 | 3 | 4;

interface WizardState {
  step: Step;
  // Step 1 inputs
  email: string;
  apiToken: string;
  siteUrl: string;
  // Step 1 result
  validating: boolean;
  validateError: string | null;
  diagnostics: Diagnostics | null;
  discoveredScopes: DiscoveredScope[];
  // Step 2 selection
  selectedScopeIdentifiers: Set<string>;
  scopeSearch: string;
  // Step 3 selections: map scope_identifier → team_space_id (or empty)
  mappings: Record<string, string>;
  // Step 4 submit
  submitting: boolean;
  submitError: string | null;
  // Optional: display_name default = siteUrl host
  displayName: string;
}

const DISPLAY_NAME_HOST_RE = /^https?:\/\/([^/]+)/;

export function ConfluenceSetupWizard({
  teamId,
  teamSpaces,
}: {
  teamId: string;
  teamSpaces: TeamSpace[];
}) {
  const t = useTranslations("team.connectors.setup");
  const tErrors = useTranslations("team.connectors.errors");
  const router = useRouter();

  const [s, setS] = useState<WizardState>({
    step: 1,
    email: "",
    apiToken: "",
    siteUrl: "",
    validating: false,
    validateError: null,
    diagnostics: null,
    discoveredScopes: [],
    selectedScopeIdentifiers: new Set(),
    scopeSearch: "",
    mappings: {},
    submitting: false,
    submitError: null,
    displayName: "",
  });

  // ---------------------------------------------------------------------
  // Step 1: validate
  // ---------------------------------------------------------------------

  const canSubmitStep1 =
    s.email.includes("@") &&
    s.apiToken.length >= 16 &&
    /^https:\/\/[a-z0-9-]+\.atlassian\.net\/?$/i.test(s.siteUrl);

  async function handleValidate() {
    if (!canSubmitStep1) return;
    setS((prev) => ({ ...prev, validating: true, validateError: null }));
    try {
      const res = await fetch(`/api/teams/${teamId}/connectors/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connector_type: "confluence-cloud",
          credentials: { email: s.email.trim(), apiToken: s.apiToken.trim() },
          config: { siteUrl: s.siteUrl.replace(/\/+$/, "") },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const code = data?.details?.code ?? "connector.integration.unknownError";
        setS((prev) => ({
          ...prev,
          validating: false,
          validateError: tErrors(code as never),
        }));
        return;
      }
      if (data.ok !== true) {
        setS((prev) => ({
          ...prev,
          validating: false,
          validateError:
            data.message ??
            tErrors(
              (data.error_code ??
                "connector.integration.credentialsRejected") as never,
            ),
        }));
        return;
      }
      const defaultName =
        DISPLAY_NAME_HOST_RE.exec(s.siteUrl)?.[1] ?? s.siteUrl;
      setS((prev) => ({
        ...prev,
        validating: false,
        diagnostics: data.diagnostics ?? null,
        discoveredScopes: data.scopes ?? [],
        displayName: prev.displayName || defaultName,
        step: 2,
      }));
    } catch (err) {
      setS((prev) => ({
        ...prev,
        validating: false,
        validateError:
          err instanceof Error ? err.message : String(err),
      }));
    }
  }

  // ---------------------------------------------------------------------
  // Step 2: scopes
  // ---------------------------------------------------------------------

  const filteredScopes = s.scopeSearch
    ? s.discoveredScopes.filter(
        (scope) =>
          scope.scope_identifier
            .toLowerCase()
            .includes(s.scopeSearch.toLowerCase()) ||
          String(
            (scope.scope_metadata as { displayName?: string } | null)
              ?.displayName ?? "",
          )
            .toLowerCase()
            .includes(s.scopeSearch.toLowerCase()),
      )
    : s.discoveredScopes;

  const toggleScope = (identifier: string) => {
    setS((prev) => {
      const next = new Set(prev.selectedScopeIdentifiers);
      if (next.has(identifier)) next.delete(identifier);
      else next.add(identifier);
      return { ...prev, selectedScopeIdentifiers: next };
    });
  };

  const canSubmitStep2 = s.selectedScopeIdentifiers.size > 0;

  // ---------------------------------------------------------------------
  // Step 3: mappings (optional)
  // ---------------------------------------------------------------------

  const selectedScopes = s.discoveredScopes.filter((scope) =>
    s.selectedScopeIdentifiers.has(scope.scope_identifier),
  );

  const usedLokriSpaceIds = new Set(
    Object.entries(s.mappings)
      .filter(([, v]) => v)
      .map(([, v]) => v),
  );

  const setMapping = (scopeIdentifier: string, spaceId: string) => {
    setS((prev) => ({
      ...prev,
      mappings: {
        ...prev.mappings,
        [scopeIdentifier]: spaceId,
      },
    }));
  };

  // ---------------------------------------------------------------------
  // Step 4: confirm + submit
  // ---------------------------------------------------------------------

  async function handleSubmit() {
    setS((prev) => ({ ...prev, submitting: true, submitError: null }));
    try {
      const body = {
        connector_type: "confluence-cloud" as const,
        display_name: s.displayName.trim() || "Confluence",
        credentials: { email: s.email.trim(), apiToken: s.apiToken.trim() },
        config: { siteUrl: s.siteUrl.replace(/\/+$/, "") },
        scopes: selectedScopes.map((scope) => ({
          scope_type: scope.scope_type,
          scope_identifier: scope.scope_identifier,
          scope_metadata: scope.scope_metadata,
        })),
        mappings: Object.entries(s.mappings)
          .filter(([, v]) => Boolean(v))
          .map(([scopeIdentifier, spaceId]) => ({
            space_id: spaceId,
            scope_identifier: scopeIdentifier,
          })),
      };
      const res = await fetch(`/api/teams/${teamId}/connectors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        const code =
          data?.details?.code ?? "connector.integration.unknownError";
        setS((prev) => ({
          ...prev,
          submitting: false,
          submitError: tErrors(code as never),
        }));
        return;
      }
      // Success — redirect zur Detail-Seite
      router.push(`/team/connectors/${data.id}`);
      router.refresh();
    } catch (err) {
      setS((prev) => ({
        ...prev,
        submitting: false,
        submitError: err instanceof Error ? err.message : String(err),
      }));
    }
  }

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------

  return (
    <div className="space-y-4">
      <StepIndicator current={s.step} t={t} />

      {s.step === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("step1.title")}</CardTitle>
            <CardDescription>{t("step1.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="c-email">{t("step1.emailLabel")}</Label>
              <Input
                id="c-email"
                type="email"
                autoComplete="off"
                value={s.email}
                onChange={(e) => setS({ ...s, email: e.target.value })}
                placeholder="jane@firma.de"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-token">{t("step1.apiTokenLabel")}</Label>
              <Input
                id="c-token"
                type="password"
                autoComplete="off"
                value={s.apiToken}
                onChange={(e) => setS({ ...s, apiToken: e.target.value })}
                placeholder="ATATT3xFfGF0T0k…"
              />
              <p className="text-xs text-muted-foreground">
                {t("step1.apiTokenHint")}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-site">{t("step1.siteUrlLabel")}</Label>
              <Input
                id="c-site"
                type="url"
                autoComplete="off"
                value={s.siteUrl}
                onChange={(e) => setS({ ...s, siteUrl: e.target.value })}
                placeholder="https://firma.atlassian.net"
              />
            </div>
            {s.validateError ? (
              <p className="text-sm text-destructive">{s.validateError}</p>
            ) : null}
            <div className="flex justify-end">
              <Button
                onClick={handleValidate}
                disabled={!canSubmitStep1 || s.validating}
              >
                {s.validating
                  ? t("step1.validating")
                  : t("step1.validateCta")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {s.step === 2 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("step2.title")}</CardTitle>
            <CardDescription>
              {t("step2.description", {
                publicName:
                  s.diagnostics?.publicName ??
                  s.diagnostics?.displayName ??
                  s.email,
              })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              type="search"
              value={s.scopeSearch}
              onChange={(e) => setS({ ...s, scopeSearch: e.target.value })}
              placeholder={t("step2.searchPlaceholder")}
            />
            <div className="max-h-[360px] space-y-1 overflow-y-auto rounded border p-3">
              {filteredScopes.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  {t("step2.noMatches")}
                </p>
              ) : (
                filteredScopes.map((scope) => {
                  const selected = s.selectedScopeIdentifiers.has(
                    scope.scope_identifier,
                  );
                  const name =
                    (
                      scope.scope_metadata as { displayName?: string } | null
                    )?.displayName ?? scope.scope_identifier;
                  return (
                    <label
                      key={scope.scope_identifier}
                      className="flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 hover:bg-muted"
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleScope(scope.scope_identifier)}
                        className="h-4 w-4"
                      />
                      <span className="flex-1">{name}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {scope.scope_identifier}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("step2.selectionSummary", {
                count: s.selectedScopeIdentifiers.size,
                total: s.discoveredScopes.length,
              })}
            </p>
            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={() => setS({ ...s, step: 1 })}
              >
                {t("common.back")}
              </Button>
              <Button
                onClick={() => setS({ ...s, step: 3 })}
                disabled={!canSubmitStep2}
              >
                {t("common.next")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {s.step === 3 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("step3.title")}</CardTitle>
            <CardDescription>{t("step3.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {teamSpaces.length === 0 ? (
              <p className="rounded bg-muted p-3 text-sm text-muted-foreground">
                {t("step3.noTeamSpaces")}
              </p>
            ) : (
              <div className="space-y-3">
                {selectedScopes.map((scope) => {
                  const name =
                    (
                      scope.scope_metadata as { displayName?: string } | null
                    )?.displayName ?? scope.scope_identifier;
                  const current = s.mappings[scope.scope_identifier] ?? "";
                  return (
                    <div
                      key={scope.scope_identifier}
                      className="flex flex-wrap items-center gap-3 border-b pb-3 last:border-b-0 last:pb-0"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <span className="truncate font-medium">{name}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {scope.scope_identifier}
                        </span>
                      </div>
                      <span className="text-muted-foreground">→</span>
                      <select
                        className="rounded border bg-background px-2 py-1 text-sm"
                        value={current}
                        onChange={(e) =>
                          setMapping(scope.scope_identifier, e.target.value)
                        }
                      >
                        <option value="">{t("step3.noMapping")}</option>
                        {teamSpaces.map((space) => {
                          const disabled =
                            current !== space.id &&
                            usedLokriSpaceIds.has(space.id);
                          return (
                            <option
                              key={space.id}
                              value={space.id}
                              disabled={disabled}
                            >
                              {space.name}
                              {disabled ? ` · ${t("step3.alreadyMapped")}` : ""}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={() => setS({ ...s, step: 2 })}
              >
                {t("common.back")}
              </Button>
              <Button onClick={() => setS({ ...s, step: 4 })}>
                {t("common.next")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {s.step === 4 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("step4.title")}</CardTitle>
            <CardDescription>{t("step4.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="c-display-name">{t("step4.displayNameLabel")}</Label>
              <Input
                id="c-display-name"
                value={s.displayName}
                onChange={(e) => setS({ ...s, displayName: e.target.value })}
                maxLength={100}
              />
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Field label={t("step4.siteLabel")} value={s.siteUrl} />
              <Field label={t("step4.emailLabel")} value={s.email} />
              <Field
                label={t("step4.scopesLabel")}
                value={String(s.selectedScopeIdentifiers.size)}
              />
              <Field
                label={t("step4.mappingsLabel")}
                value={String(
                  Object.values(s.mappings).filter(Boolean).length,
                )}
              />
            </dl>
            {s.submitError ? (
              <p className="text-sm text-destructive">{s.submitError}</p>
            ) : null}
            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={() => setS({ ...s, step: 3 })}
                disabled={s.submitting}
              >
                {t("common.back")}
              </Button>
              <Button onClick={handleSubmit} disabled={s.submitting}>
                {s.submitting ? t("step4.submitting") : t("step4.submitCta")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function StepIndicator({
  current,
  t,
}: {
  current: Step;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}) {
  const steps: Array<{ n: Step; key: string }> = [
    { n: 1, key: "step1.short" },
    { n: 2, key: "step2.short" },
    { n: 3, key: "step3.short" },
    { n: 4, key: "step4.short" },
  ];
  return (
    <ol className="flex items-center gap-3 text-sm">
      {steps.map((step, i) => {
        const state =
          step.n === current ? "current" : step.n < current ? "done" : "pending";
        return (
          <li key={step.n} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                state === "done"
                  ? "bg-emerald-500 text-white"
                  : state === "current"
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {step.n}
            </span>
            <span
              className={
                state === "pending"
                  ? "text-muted-foreground"
                  : "text-foreground"
              }
            >
              {t(step.key)}
            </span>
            {i < steps.length - 1 ? (
              <span className="text-muted-foreground">·</span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-all">{value}</dd>
    </div>
  );
}
