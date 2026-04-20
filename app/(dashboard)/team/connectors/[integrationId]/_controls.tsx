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
 * Interaktive Controls der Detail-Seite: Overview-Card (display_name,
 * enabled, test-connection), Credentials-Card (Rotation), Danger-Zone.
 *
 * Drei eigene Karten in einem Client-File — weil sie alle Owner-only
 * sind und State-Wiederverwendung bei toast/error-handling teilen.
 */

interface Props {
  teamId: string;
  integrationId: string;
  initialDisplayName: string;
  initialEnabled: boolean;
  connectorType: string;
  config: Record<string, unknown>;
  lastTestedLabel: string;
  hasLastError: boolean;
}

export function ConnectorDetailControls(props: Props) {
  return (
    <>
      <OverviewCard {...props} />
      <CredentialsCard {...props} />
      <DangerZoneCard {...props} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Overview-Card: display_name + enabled + test
// ---------------------------------------------------------------------------

function OverviewCard({
  teamId,
  integrationId,
  initialDisplayName,
  initialEnabled,
  lastTestedLabel,
  hasLastError,
}: Props) {
  const t = useTranslations("team.connectors.detail");
  const tErrors = useTranslations("team.connectors.errors");
  const router = useRouter();

  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [savingName, setSavingName] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [testing, setTesting] = useState(false);

  const nameDirty = displayName.trim() !== initialDisplayName;

  async function saveName() {
    if (!nameDirty) return;
    setSavingName(true);
    const res = await fetch(
      `/api/teams/${teamId}/connectors/${integrationId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: displayName.trim() }),
      },
    );
    setSavingName(false);
    if (!res.ok) {
      toast.error(await extractErrorMessage(res, tErrors));
      return;
    }
    toast.success(t("saved"));
    router.refresh();
  }

  async function toggleEnabled() {
    const next = !enabled;
    setToggling(true);
    const res = await fetch(
      `/api/teams/${teamId}/connectors/${integrationId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      },
    );
    setToggling(false);
    if (!res.ok) {
      toast.error(await extractErrorMessage(res, tErrors));
      return;
    }
    setEnabled(next);
    toast.success(next ? t("enabledTrue") : t("enabledFalse"));
    router.refresh();
  }

  async function runTest() {
    setTesting(true);
    const res = await fetch(
      `/api/teams/${teamId}/connectors/${integrationId}/test`,
      { method: "POST" },
    );
    setTesting(false);
    if (!res.ok) {
      toast.error(await extractErrorMessage(res, tErrors));
      router.refresh();
      return;
    }
    const body = (await res.json()) as {
      ok: boolean;
      message: string;
      diagnostics: Record<string, unknown> | null;
    };
    if (body.ok) {
      toast.success(t("testSuccess", { message: body.message }));
    } else {
      toast.error(t("testFailure", { message: body.message }));
    }
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("overviewTitle")}</CardTitle>
        <CardDescription>{t("overviewDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="display-name">{t("displayNameLabel")}</Label>
          <div className="flex gap-2">
            <Input
              id="display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={100}
              disabled={savingName}
            />
            <Button
              onClick={saveName}
              disabled={!nameDirty || savingName}
            >
              {savingName ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {savingName ? t("saving") : t("save")}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-3 border-t pt-4">
          <div className="space-y-1">
            <div className="font-medium">{t("enabledLabel")}</div>
            <p className="text-sm text-muted-foreground">
              {enabled
                ? t("enabledHintOn")
                : t("enabledHintOff")}
            </p>
          </div>
          <Button
            variant={enabled ? "outline" : "default"}
            onClick={toggleEnabled}
            disabled={toggling}
          >
            {toggling ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {enabled ? t("enabledToggleOff") : t("enabledToggleOn")}
          </Button>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-3 border-t pt-4">
          <div className="space-y-1">
            <div className="font-medium">{t("testLabel")}</div>
            <p className="text-sm text-muted-foreground">
              {t("testHint", { lastTested: lastTestedLabel })}
            </p>
            {hasLastError ? (
              <p className="flex items-center gap-1 text-sm text-destructive">
                <AlertTriangle className="h-3 w-3" />
                {t("testFailingHint")}
              </p>
            ) : null}
          </div>
          <Button
            variant="outline"
            onClick={runTest}
            disabled={testing}
          >
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {testing ? t("testing") : t("testCta")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Credentials-Card: Rotation via Modal
// ---------------------------------------------------------------------------

function CredentialsCard({
  teamId,
  integrationId,
  connectorType,
  config,
}: Props) {
  const t = useTranslations("team.connectors.detail");
  const tSetup = useTranslations("team.connectors.setup");
  const tErrors = useTranslations("team.connectors.errors");
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [apiToken, setApiToken] = useState("");
  const initialSiteUrl = (config as { siteUrl?: string }).siteUrl ?? "";
  const [siteUrl, setSiteUrl] = useState(initialSiteUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    email.includes("@") &&
    apiToken.length >= 16 &&
    /^https:\/\/[a-z0-9-]+\.atlassian\.net\/?$/i.test(siteUrl);

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const res = await fetch(
      `/api/teams/${teamId}/connectors/${integrationId}/credentials`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connector_type: connectorType,
          credentials: { email: email.trim(), apiToken: apiToken.trim() },
          config: { siteUrl: siteUrl.replace(/\/+$/, "") },
        }),
      },
    );
    setBusy(false);
    if (!res.ok) {
      setError(await extractErrorMessage(res, tErrors));
      return;
    }
    toast.success(t("credentialsRotated"));
    setOpen(false);
    setEmail("");
    setApiToken("");
    router.refresh();
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("credentialsTitle")}</CardTitle>
          <CardDescription>{t("credentialsDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">
                {t("credentialsSiteLabel")}
              </dt>
              <dd className="mt-0.5 break-all font-mono">{initialSiteUrl}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                {t("credentialsTypeLabel")}
              </dt>
              <dd className="mt-0.5 font-mono">{connectorType}</dd>
            </div>
          </dl>
          <Button variant="outline" onClick={() => setOpen(true)}>
            {t("credentialsRotateCta")}
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("credentialsRotateTitle")}</DialogTitle>
            <DialogDescription>
              {t("credentialsRotateDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="rot-email">{tSetup("step1.emailLabel")}</Label>
              <Input
                id="rot-email"
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rot-token">{tSetup("step1.apiTokenLabel")}</Label>
              <Input
                id="rot-token"
                type="password"
                autoComplete="off"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rot-site">{tSetup("step1.siteUrlLabel")}</Label>
              <Input
                id="rot-site"
                type="url"
                autoComplete="off"
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
              />
            </div>
            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              {tSetup("common.back")}
            </Button>
            <Button onClick={submit} disabled={!canSubmit || busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {busy ? t("credentialsRotating") : t("credentialsRotateSubmit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Danger-Zone: Delete mit Typing-Confirmation
// ---------------------------------------------------------------------------

function DangerZoneCard({
  teamId,
  integrationId,
  initialDisplayName,
}: Props) {
  const t = useTranslations("team.connectors.detail");
  const tErrors = useTranslations("team.connectors.errors");
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (confirm !== initialDisplayName) {
      toast.error(t("deleteMismatch"));
      return;
    }
    setBusy(true);
    const res = await fetch(
      `/api/teams/${teamId}/connectors/${integrationId}`,
      { method: "DELETE" },
    );
    setBusy(false);
    if (!res.ok) {
      toast.error(await extractErrorMessage(res, tErrors));
      return;
    }
    toast.success(t("deleteSuccess"));
    setOpen(false);
    router.push("/team/connectors");
    router.refresh();
  }

  return (
    <>
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {t("deleteTitle")}
          </CardTitle>
          <CardDescription>{t("deleteDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={() => setOpen(true)}>
            {t("deleteCta")}
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("deleteConfirmDescription", { name: initialDisplayName })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-muted-foreground">
              {t("deleteWarning")}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="del-confirm">
                {t("deleteConfirmPrompt", { name: initialDisplayName })}
              </Label>
              <Input
                id="del-confirm"
                autoComplete="off"
                autoFocus
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              {t("deleteCancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={submit}
              disabled={busy || confirm !== initialDisplayName}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {busy ? t("deleting") : t("deleteConfirmSubmit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Shared helper
// ---------------------------------------------------------------------------

async function extractErrorMessage(
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
      // i18n-Lookup: der Key-Pfad ist `connector.integration.<leaf>` —
      // tErrors ist auf `team.connectors.errors` gemountet.
      try {
        return tErrors(code as never);
      } catch {
        // kein Key gefunden — fall through
      }
    }
    return body?.details?.message ?? body?.error ?? res.statusText;
  } catch {
    return res.statusText;
  }
}
