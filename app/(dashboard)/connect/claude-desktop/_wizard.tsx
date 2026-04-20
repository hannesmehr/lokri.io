"use client";

import { AlertTriangle, Check, Copy, Loader2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { buttonVariants, Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * 4-Step-Wizard für Claude-Desktop-Setup.
 *
 * Steps:
 *   1. Scope-Auswahl (all / selected) + Read-only-Toggle.
 *      KEIN Laufzeit-Dropdown — Tokens sind „gültig bis widerrufen"
 *      (bestehendes Schema, Phase-2-Feature).
 *   2. Token-Benennung (Default aus Session-Name).
 *   3. Token wird erstellt → Config-Snippet mit OS-spezifischem Pfad.
 *   4. Fertigstellung + Links.
 *
 * Der Plaintext-Token wird genau einmal gezeigt (Step 3 + 4). Nach
 * Schliessen der Seite kann er nicht mehr abgerufen werden — User muss
 * einen neuen erstellen, wenn er verloren geht.
 */

interface TeamSpace {
  id: string;
  name: string;
}

type Step = 1 | 2 | 3 | 4;
type ScopeMode = "all" | "selected";
type OS = "macos" | "windows" | "linux";

interface TokenResult {
  id: string;
  name: string;
  plaintext: string;
  tokenPrefix: string;
  createdAt: string;
}

export function ClaudeDesktopWizard({
  teamSpaces,
  defaultName,
  mcpUrl,
}: {
  teamSpaces: TeamSpace[];
  defaultName: string;
  mcpUrl: string;
}) {
  const t = useTranslations("connect.claudeDesktop");
  const [step, setStep] = useState<Step>(1);

  // Step 1 state
  const [scopeMode, setScopeMode] = useState<ScopeMode>("all");
  const [selectedSpaces, setSelectedSpaces] = useState<Set<string>>(
    new Set(),
  );
  const [readOnly, setReadOnly] = useState(false);

  // Step 2 state
  const [name, setName] = useState(defaultName);

  // Step 3 state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [token, setToken] = useState<TokenResult | null>(null);
  const [os, setOs] = useState<OS>(detectOs());

  const step1Valid =
    scopeMode === "all" ||
    (scopeMode === "selected" && selectedSpaces.size > 0);
  const step2Valid = name.trim().length > 0;

  function toggleSpace(id: string) {
    setSelectedSpaces((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function createToken() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/connect/claude-desktop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          scope:
            scopeMode === "all"
              ? { type: "all" }
              : { type: "spaces", spaceIds: [...selectedSpaces] },
          readOnly,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setSubmitError(body.error ?? res.statusText);
        setSubmitting(false);
        return;
      }
      const data = (await res.json()) as { token: TokenResult };
      setToken(data.token);
      setStep(3);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const configSnippet = token
    ? buildConfigSnippet({ mcpUrl, token: token.plaintext })
    : "";
  const configPath = token ? configPathForOs(os) : "";

  return (
    <div className="space-y-4">
      <StepIndicator current={step} t={t} />

      {step === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("step1.title")}</CardTitle>
            <CardDescription>{t("step1.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <Label>{t("step1.scopeLabel")}</Label>
              <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted">
                <input
                  type="radio"
                  name="scope"
                  checked={scopeMode === "all"}
                  onChange={() => setScopeMode("all")}
                  className="mt-0.5 h-4 w-4"
                />
                <div className="space-y-0.5">
                  <div className="font-medium">{t("step1.allLabel")}</div>
                  <div className="text-xs text-muted-foreground">
                    {t("step1.allHint")}
                  </div>
                </div>
              </label>
              <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted">
                <input
                  type="radio"
                  name="scope"
                  checked={scopeMode === "selected"}
                  onChange={() => setScopeMode("selected")}
                  className="mt-0.5 h-4 w-4"
                />
                <div className="flex-1 space-y-2">
                  <div>
                    <div className="font-medium">
                      {t("step1.selectedLabel")}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t("step1.selectedHint")}
                    </div>
                  </div>
                  {scopeMode === "selected" ? (
                    teamSpaces.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {t("step1.noSpaces")}
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {teamSpaces.map((space) => (
                          <label
                            key={space.id}
                            className="flex items-center gap-2 text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={selectedSpaces.has(space.id)}
                              onChange={() => toggleSpace(space.id)}
                              className="h-4 w-4"
                            />
                            <span>{space.name}</span>
                          </label>
                        ))}
                      </div>
                    )
                  ) : null}
                </div>
              </label>
            </div>

            <div className="space-y-3 border-t pt-4">
              <Label>{t("step1.readOnlyLabel")}</Label>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={readOnly}
                  onChange={(e) => setReadOnly(e.target.checked)}
                  className="mt-0.5 h-4 w-4"
                />
                <span>
                  {t("step1.readOnlyHint")}
                </span>
              </label>
            </div>

            <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
              {t("step1.expiryNote")}
            </p>

            <div className="flex justify-end">
              <Button onClick={() => setStep(2)} disabled={!step1Valid}>
                {t("common.next")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("step2.title")}</CardTitle>
            <CardDescription>{t("step2.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="token-name">{t("step2.nameLabel")}</Label>
              <Input
                id="token-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
              />
              <p className="text-xs text-muted-foreground">
                {t("step2.nameHint")}
              </p>
            </div>
            {submitError ? (
              <div className="flex items-start gap-2 rounded border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <p>{submitError}</p>
              </div>
            ) : null}
            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={() => setStep(1)}
                disabled={submitting}
              >
                {t("common.back")}
              </Button>
              <Button
                onClick={createToken}
                disabled={!step2Valid || submitting}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {submitting
                  ? t("step2.creatingToken")
                  : t("step2.createToken")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 3 && token ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Check className="h-5 w-5 text-emerald-600" />
              <CardTitle>{t("step3.title")}</CardTitle>
            </div>
            <CardDescription>{t("step3.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-start gap-2 rounded border border-amber-500/40 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p>{t("step3.oneTimeWarning")}</p>
            </div>

            <div className="space-y-2">
              <Label>{t("step3.configLabel")}</Label>
              <CopyableBlock
                value={configSnippet}
                copyLabel={t("common.copy")}
                copiedLabel={t("common.copied")}
              />
            </div>

            <div className="space-y-2 border-t pt-4">
              <Label>{t("step3.osLabel")}</Label>
              <div className="flex gap-2">
                {(["macos", "windows", "linux"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setOs(k)}
                    className={`rounded border px-3 py-1.5 text-sm transition ${
                      os === k
                        ? "border-foreground bg-foreground text-background"
                        : "hover:border-foreground/40"
                    }`}
                  >
                    {t(`step3.os.${k}`)}
                  </button>
                ))}
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">
                  {t("step3.pathLabel")}
                </div>
                <CopyableBlock
                  value={configPath}
                  copyLabel={t("common.copy")}
                  copiedLabel={t("common.copied")}
                  mono
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {t("step3.pathNote")}
              </p>
            </div>

            <div className="flex justify-end">
              <Button onClick={() => setStep(4)}>{t("common.next")}</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 4 && token ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("step4.title")}</CardTitle>
            <CardDescription>{t("step4.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="list-decimal space-y-2 pl-5 text-sm">
              <li>{t("step4.step1")}</li>
              <li>{t("step4.step2")}</li>
              <li>{t("step4.step3")}</li>
            </ol>

            <div className="rounded-md border bg-muted/50 p-3 text-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("step4.tryLabel")}
              </div>
              <p className="mt-1 italic">{t("step4.tryExample")}</p>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Link
                href="/settings/mcp"
                className={buttonVariants({ variant: "outline" })}
              >
                {t("step4.tokensLink")}
              </Link>
              <Link
                href="/dashboard"
                className={buttonVariants({ variant: "default" })}
              >
                {t("step4.doneCta")}
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function detectOs(): OS {
  if (typeof window === "undefined") return "macos";
  const p = window.navigator.userAgent.toLowerCase();
  if (p.includes("win")) return "windows";
  if (p.includes("linux") && !p.includes("android")) return "linux";
  return "macos";
}

function configPathForOs(os: OS): string {
  switch (os) {
    case "macos":
      return "~/Library/Application Support/Claude/claude_desktop_config.json";
    case "windows":
      return "%APPDATA%\\Claude\\claude_desktop_config.json";
    case "linux":
      return "~/.config/Claude/claude_desktop_config.json";
  }
}

function buildConfigSnippet({
  mcpUrl,
  token,
}: {
  mcpUrl: string;
  token: string;
}): string {
  // Exakt das Format, das Claude Desktop + mcp-remote erwarten. String-
  // concat statt JSON.stringify, damit wir die feste Reihenfolge +
  // 2-Space-Indentation kontrollieren können.
  const body = {
    mcpServers: {
      lokri: {
        command: "npx",
        args: [
          "-y",
          "mcp-remote",
          mcpUrl,
          "--header",
          `Authorization:Bearer ${token}`,
        ],
      },
    },
  };
  return JSON.stringify(body, null, 2);
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
      {steps.map((s, i) => {
        const state =
          s.n === current ? "current" : s.n < current ? "done" : "pending";
        return (
          <li key={s.n} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                state === "done"
                  ? "bg-emerald-500 text-white"
                  : state === "current"
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {s.n}
            </span>
            <span
              className={
                state === "pending"
                  ? "text-muted-foreground"
                  : "text-foreground"
              }
            >
              {t(s.key)}
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

function CopyableBlock({
  value,
  copyLabel,
  copiedLabel,
  mono,
}: {
  value: string;
  copyLabel: string;
  copiedLabel: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(copiedLabel);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy failed");
    }
  }
  return (
    <div className="relative">
      <pre
        className={`rounded-md border bg-muted/50 p-3 pr-20 text-xs ${
          mono ? "font-mono" : "font-mono"
        } whitespace-pre-wrap break-all`}
      >
        {value}
      </pre>
      <button
        type="button"
        onClick={copy}
        className="absolute right-2 top-2 inline-flex items-center gap-1 rounded border bg-background px-2 py-1 text-xs hover:border-foreground/40"
      >
        {copied ? (
          <Check className="h-3 w-3" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
        {copied ? copiedLabel : copyLabel}
      </button>
    </div>
  );
}
