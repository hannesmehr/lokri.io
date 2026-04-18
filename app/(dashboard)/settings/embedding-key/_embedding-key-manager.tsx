"use client";

import {
  AlertTriangle,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateTime } from "@/lib/format";

interface ActiveKey {
  id: string;
  provider: "openai";
  model: string;
  lastUsedAt: string | null;
  createdAt: string;
  maskedKey?: string | null;
}

const PROVIDER_LABEL: Record<ActiveKey["provider"], string> = {
  openai: "OpenAI",
};

const MODEL_OPTIONS: Record<ActiveKey["provider"], string[]> = {
  openai: ["text-embedding-3-small", "text-embedding-ada-002"],
};

export function EmbeddingKeyManager({
  initial,
}: {
  initial: ActiveKey | null;
}) {
  const t = useTranslations("settings.embeddingKey");
  const tErrors = useTranslations("errors.api.embeddingKey");
  const tToasts = useTranslations("toasts");
  const tConfirm = useTranslations("confirmDialogs");
  const router = useRouter();
  const [current, setCurrent] = useState<ActiveKey | null>(initial);
  const [provider] = useState<ActiveKey["provider"]>("openai");
  const [model, setModel] = useState<string>(initial?.model ?? MODEL_OPTIONS.openai[0]);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [removing, setRemoving] = useState(false);

  const valid = apiKey.trim().length >= 20 && model && provider;

  function apiErrorMessage(body: { details?: { code?: unknown }; error?: string } | null, fallback: string) {
    const suffix =
      typeof body?.details?.code === "string"
        ? body.details.code.split(".").pop()
        : null;
    return suffix && tErrors.has(suffix)
      ? tErrors(suffix)
      : body?.error ?? fallback;
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!valid) return;
    setSubmitting(true);
    const res = await fetch("/api/embedding-key", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider,
        model,
        apiKey: apiKey.trim(),
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(apiErrorMessage(data, t("toasts.saveFailed")));
      return;
    }
    const body = await res.json();
    setCurrent({
      ...body.key,
      lastUsedAt: null,
      createdAt: body.key.createdAt,
      maskedKey: body.key.maskedKey ?? null,
    });
    setApiKey("");
    toast.success(t("toasts.saved"));
    router.refresh();
  }

  async function remove() {
    if (!confirm(`${tConfirm("delete.title")}\n\n${t("dialogs.deleteDescription")}`)) return;
    setRemoving(true);
    const res = await fetch("/api/embedding-key", { method: "DELETE" });
    setRemoving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(apiErrorMessage(body, t("toasts.deleteFailed")));
      return;
    }
    setCurrent(null);
    toast.success(tToasts("success.deleted"));
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <Alert className="border-l-2 border-l-brand bg-muted/40">
        <AlertTitle>{t("intro.title")}</AlertTitle>
        <AlertDescription className="text-sm text-muted-foreground">
          {t("intro.description")}
        </AlertDescription>
      </Alert>

      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-muted text-muted-foreground">
                <KeyRound className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-medium">{t("currentKey.title")}</div>
                <div className="text-xs text-muted-foreground">
                  {current ? t("currentKey.activeDescription") : t("currentKey.inactiveDescription")}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="bg-muted text-foreground">
                {current ? t("currentKey.activeBadge") : t("currentKey.inactiveBadge")}
              </Badge>
              {current ? (
                <span className="font-mono text-xs text-muted-foreground">
                  {PROVIDER_LABEL[current.provider]} / {current.model}
                </span>
              ) : null}
            </div>
            {current?.maskedKey ? (
              <div className="font-mono text-xs text-muted-foreground">
                {t("currentKey.masked", { value: current.maskedKey })}
              </div>
            ) : null}
            {current ? (
              <div className="space-y-1 font-mono text-xs text-muted-foreground">
                <div>{t("currentKey.createdAt", { datetime: formatDateTime(current.createdAt) })}</div>
                <div>
                  {current.lastUsedAt
                    ? t("currentKey.lastVerifiedAt", { datetime: formatDateTime(current.lastUsedAt) })
                    : t("currentKey.neverVerified")}
                </div>
              </div>
            ) : null}
          </div>
          {current ? (
            <Button type="button" variant="outline" onClick={remove} disabled={removing}>
              {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {t("actions.delete")}
            </Button>
          ) : null}
        </div>
      </div>

      <form onSubmit={save} className="space-y-4">
        <div className="rounded-xl border bg-card p-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("form.providerLabel")}</Label>
              <div className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm text-muted-foreground">
                OpenAI
                <Badge variant="secondary" className="ml-2 bg-muted text-[10px] text-foreground">
                  {t("form.providerNote")}
                </Badge>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="model-select">
                {t("form.modelLabel")}
              </Label>
              <select
                id="model-select"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="flex h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                {MODEL_OPTIONS[provider].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">
                {t("form.modelHint")}
              </p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="api-key-input">
              {t("form.apiKeyLabel")}
            </Label>
            <div className="relative">
              <Input
                id="api-key-input"
                type={showKey ? "text" : "password"}
                autoComplete="off"
                value={apiKey}
                placeholder={t("form.apiKeyPlaceholder")}
                onChange={(e) => setApiKey(e.target.value)}
                className="pr-10 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setShowKey((value) => !value)}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                aria-label={showKey ? t("actions.hideKey") : t("actions.showKey")}
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {t("form.apiKeyHint")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!valid || submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {submitting
                ? t("actions.saving")
                : current
                  ? t("actions.rotate")
                  : t("actions.save")}
            </Button>
            {current ? (
              <Button type="button" variant="outline" onClick={remove} disabled={removing}>
                {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {t("actions.delete")}
              </Button>
            ) : null}
          </div>
        </div>
      </form>

      <Alert className="border-l-2 border-l-brand bg-muted/40">
        <AlertTitle className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          {t("dialogs.rotateWarningTitle")}
        </AlertTitle>
        <AlertDescription className="text-xs text-muted-foreground">
          {t("dialogs.rotateWarningBody", {
            modelA: "text-embedding-3-small",
            modelB: "text-embedding-ada-002",
            reindexLabel: t("dialogs.reindexLabel"),
          })}
        </AlertDescription>
      </Alert>
    </div>
  );
}
