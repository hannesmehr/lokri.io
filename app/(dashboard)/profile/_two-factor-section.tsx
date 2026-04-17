"use client";

import { Check, Copy, ShieldCheck, ShieldOff } from "lucide-react";
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
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border p-4">
      <div className="flex items-start gap-3">
        <div
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
            enabled
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {enabled ? (
            <ShieldCheck className="h-4 w-4" />
          ) : (
            <ShieldOff className="h-4 w-4" />
          )}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">Zwei-Faktor-Authentifizierung</span>
            {enabled ? (
              <Badge
                variant="secondary"
                className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              >
                aktiv
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            TOTP-Code aus Authenticator-App + Backup-Codes. Schützt deinen
            Login zusätzlich zu Email + Passwort.
          </p>
        </div>
      </div>
      {enabled ? (
        <DisableDialog onChanged={onChanged} />
      ) : (
        <EnableDialog onChanged={onChanged} />
      )}
    </div>
  );
}

// ---------- Enable flow ----------

function EnableDialog({ onChanged }: { onChanged?: () => void }) {
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
    const { data, error: err } = await authClient.twoFactor.enable({
      password,
    });
    setLoading(false);
    if (err || !data) {
      setError(err?.message ?? "Falsches Passwort.");
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
      setError(err.message ?? "Code ungültig.");
      return;
    }
    setStep("backup");
  }

  function finish() {
    setOpen(false);
    onChanged?.();
    toast.success("2FA aktiviert.");
    // Reset after close animation
    setTimeout(() => {
      setStep("password");
      setPassword("");
      setCode("");
      setTotpUri(null);
      setBackupCodes([]);
    }, 300);
  }

  function copyCodes() {
    void navigator.clipboard.writeText(backupCodes.join("\n"));
    toast.success("Backup-Codes kopiert.");
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : finish())}>
      <DialogTrigger render={<Button size="sm">Aktivieren</Button>} />
      <DialogContent>
        {step === "password" && (
          <>
            <DialogHeader>
              <DialogTitle>2FA aktivieren</DialogTitle>
              <DialogDescription>
                Bestätige dein aktuelles Passwort, um mit der Einrichtung zu
                starten.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="current-password">Passwort</Label>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button onClick={enable} disabled={loading || !password}>
                {loading ? "Prüfe…" : "Weiter"}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "qr" && totpUri && (
          <>
            <DialogHeader>
              <DialogTitle>Authenticator-App verknüpfen</DialogTitle>
              <DialogDescription>
                Scann den QR-Code in deiner Authenticator-App (1Password,
                Google Authenticator, Authy, Raycast…) und gib dann den 6-stelligen
                Code zur Bestätigung ein.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex justify-center rounded-lg border bg-white p-4">
                {/* Google Charts as a zero-dep QR renderer — fine for the  */}
                {/* infrequent 2FA-enroll flow. */}
                <img
                  alt="TOTP QR code"
                  width={192}
                  height={192}
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=192x192&data=${encodeURIComponent(totpUri)}`}
                />
              </div>
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">
                  Kannst den QR-Code nicht scannen?
                </summary>
                <pre className="mt-2 overflow-x-auto rounded-md border bg-muted/40 p-2">
                  <code>{totpUri}</code>
                </pre>
              </details>
              <div className="space-y-2">
                <Label htmlFor="totp-code">6-stelliger Code</Label>
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
                />
                {error && (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button onClick={verify} disabled={loading || code.length !== 6}>
                {loading ? "Prüfe…" : "Bestätigen"}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "backup" && (
          <>
            <DialogHeader>
              <DialogTitle>Backup-Codes</DialogTitle>
              <DialogDescription>
                Speichere diese Codes an einem sicheren Ort. Jeder Code
                funktioniert genau einmal, falls du keinen Zugriff auf deine
                Authenticator-App hast.
              </DialogDescription>
            </DialogHeader>
            <Alert>
              <AlertTitle>Einmalig sichtbar</AlertTitle>
              <AlertDescription>
                Nach dem Schließen kannst du die Codes nicht mehr anzeigen.
              </AlertDescription>
            </Alert>
            <pre className="grid grid-cols-2 gap-1 rounded-md border bg-muted/40 p-3 font-mono text-xs">
              {backupCodes.map((c) => (
                <code key={c}>{c}</code>
              ))}
            </pre>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={copyCodes}>
                <Copy className="h-3.5 w-3.5" />
                Kopieren
              </Button>
              <Button onClick={finish}>
                <Check className="h-3.5 w-3.5" />
                Fertig
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------- Disable flow ----------

function DisableDialog({ onChanged }: { onChanged?: () => void }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function disable() {
    setError(null);
    setLoading(true);
    const { error: err } = await authClient.twoFactor.disable({ password });
    setLoading(false);
    if (err) {
      setError(err.message ?? "Falsches Passwort.");
      return;
    }
    setOpen(false);
    setPassword("");
    onChanged?.();
    toast.success("2FA deaktiviert.");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setPassword("");
          setError(null);
        }
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            Deaktivieren
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>2FA deaktivieren</DialogTitle>
          <DialogDescription>
            Nach dem Deaktivieren reicht Email + Passwort zum Login. Empfohlen
            nur, wenn du deinen Authenticator-Zugang verloren hast.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="disable-password">Passwort zur Bestätigung</Label>
          <Input
            id="disable-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="destructive"
            onClick={disable}
            disabled={loading || !password}
          >
            {loading ? "Deaktiviere…" : "2FA deaktivieren"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
