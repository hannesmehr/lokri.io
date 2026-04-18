"use client";

import {
  Check,
  Copy,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { authClient } from "@/lib/auth-client";

interface Props {
  enabled: boolean;
  onChanged?: () => void;
}

export function TwoFactorSection({ enabled, onChanged }: Props) {
  const t = useTranslations("profile.security.twoFactor");

  return (
    <div className="rounded-xl border p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-muted text-foreground">
            {enabled ? (
              <ShieldCheck className="h-4 w-4" />
            ) : (
              <ShieldOff className="h-4 w-4" />
            )}
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{t("title")}</span>
              <Badge variant="outline">
                {enabled ? t("active.badge") : t("setup.badge")}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>
        </div>
        {enabled ? (
          <DisableDialog onChanged={onChanged} />
        ) : (
          <EnableDialog onChanged={onChanged} />
        )}
      </div>
    </div>
  );
}

function EnableDialog({ onChanged }: { onChanged?: () => void }) {
  const t = useTranslations("profile.security.twoFactor");
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"password" | "qr" | "backup">("password");
  const [password, setPassword] = useState("");
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enable() {
    setError(null);
    setLoading(true);
    const { data, error: err } = await authClient.twoFactor.enable({ password });
    setLoading(false);
    if (err || !data) {
      setError(err?.message ?? t("setup.errors.password"));
      return;
    }
    setTotpUri(data.totpURI);
    setBackupCodes(data.backupCodes);
    setStep("qr");
  }

  async function verify() {
    setError(null);
    setLoading(true);
    const { error: err } = await authClient.twoFactor.verifyTotp({
      code: code.trim(),
    });
    setLoading(false);
    if (err) {
      setError(err.message ?? t("setup.errors.code"));
      return;
    }
    setStep("backup");
  }

  function reset() {
    setStep("password");
    setPassword("");
    setCode("");
    setTotpUri(null);
    setBackupCodes([]);
    setError(null);
  }

  function finish() {
    setOpen(false);
    onChanged?.();
    toast.success(t("active.enabledToast"));
    setTimeout(reset, 300);
  }

  function copyCodes() {
    void navigator.clipboard.writeText(backupCodes.join("\n"));
    toast.success(t("recoveryCodes.copied"));
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value && step !== "backup") reset();
      }}
    >
      <DialogTrigger render={<Button size="sm">{t("setup.trigger")}</Button>} />
      <DialogContent>
        {step === "password" ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("setup.title")}</DialogTitle>
              <DialogDescription>{t("setup.description")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="current-password">{t("setup.passwordLabel")}</Label>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {error ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                {t("setup.cancel")}
              </Button>
              <Button onClick={enable} disabled={loading || !password}>
                {loading ? t("setup.validating") : t("setup.next")}
              </Button>
            </DialogFooter>
          </>
        ) : null}

        {step === "qr" && totpUri ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("setup.qrTitle")}</DialogTitle>
              <DialogDescription>{t("setup.qrDescription")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex justify-center rounded-xl border bg-white p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt={t("setup.qrAlt")}
                  width={192}
                  height={192}
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=192x192&data=${encodeURIComponent(totpUri)}`}
                  className="h-auto max-w-full"
                />
              </div>
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">{t("setup.manualToggle")}</summary>
                <pre className="mt-2 overflow-x-auto rounded-md border bg-muted p-3 font-mono text-xs">
                  <code>{totpUri}</code>
                </pre>
              </details>
              <div className="space-y-2">
                <Label htmlFor="totp-code">{t("setup.codeLabel")}</Label>
                <Input
                  id="totp-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="123456"
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  className="font-mono text-center tracking-[0.3em]"
                />
                {error ? (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                ) : null}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                {t("setup.cancel")}
              </Button>
              <Button onClick={verify} disabled={loading || code.length !== 6}>
                {loading ? t("setup.verifying") : t("setup.verify")}
              </Button>
            </DialogFooter>
          </>
        ) : null}

        {step === "backup" ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("recoveryCodes.title")}</DialogTitle>
              <DialogDescription>{t("recoveryCodes.description")}</DialogDescription>
            </DialogHeader>
            <Alert>
              <AlertTitle>{t("recoveryCodes.warningTitle")}</AlertTitle>
              <AlertDescription>{t("recoveryCodes.warningBody")}</AlertDescription>
            </Alert>
            <pre className="grid grid-cols-2 gap-1 rounded-md border bg-muted p-3 font-mono text-xs">
              {backupCodes.map((backupCode) => (
                <code key={backupCode}>{backupCode}</code>
              ))}
            </pre>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={copyCodes}>
                <Copy className="h-3.5 w-3.5" />
                {t("recoveryCodes.copy")}
              </Button>
              <Button onClick={finish}>
                <Check className="h-3.5 w-3.5" />
                {t("recoveryCodes.finish")}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DisableDialog({ onChanged }: { onChanged?: () => void }) {
  const t = useTranslations("profile.security.twoFactor");
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function reset() {
    setPassword("");
    setError(null);
  }

  async function disable() {
    setError(null);
    setLoading(true);
    const { error: err } = await authClient.twoFactor.disable({ password });
    setLoading(false);
    if (err) {
      setError(err.message ?? t("disable.errors.password"));
      return;
    }
    setOpen(false);
    reset();
    onChanged?.();
    toast.success(t("disable.success"));
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            {t("disable.trigger")}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("disable.title")}</DialogTitle>
          <DialogDescription>{t("disable.description")}</DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-muted-foreground">
          {t("disable.warning")}
        </div>
        <div className="space-y-2">
          <Label htmlFor="disable-password">{t("disable.passwordLabel")}</Label>
          <Input
            id="disable-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {t("disable.cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={disable}
            disabled={loading || !password}
          >
            {loading ? t("disable.submitting") : t("disable.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
