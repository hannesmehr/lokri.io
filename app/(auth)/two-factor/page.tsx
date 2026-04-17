"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

/**
 * After a successful password check, better-auth returns `twoFactorRedirect:
 * true` and the auth-client redirects us here. We have a short-lived
 * half-session cookie; submitting a valid TOTP code or backup code completes
 * the sign-in and upgrades to a full session.
 */
export default function TwoFactorChallengePage() {
  const router = useRouter();
  const [mode, setMode] = useState<"totp" | "backup">("totp");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const trimmed = code.trim();
    const { error: err } =
      mode === "totp"
        ? await authClient.twoFactor.verifyTotp({ code: trimmed })
        : await authClient.twoFactor.verifyBackupCode({ code: trimmed });
    setLoading(false);
    if (err) {
      setError(err.message ?? "Code ungültig.");
      return;
    }
    toast.success("Angemeldet.");
    router.push("/dashboard");
    router.refresh();
  }

  const isTotp = mode === "totp";

  return (
    <Card className="backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="font-display text-3xl leading-tight">
          Zwei-Faktor-Code
        </CardTitle>
        <CardDescription>
          {isTotp
            ? "Gib den 6-stelligen Code aus deiner Authenticator-App ein."
            : "Gib einen deiner Backup-Codes ein. Jeder funktioniert nur einmal."}
        </CardDescription>
      </CardHeader>
      <form onSubmit={submit}>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="code">{isTotp ? "TOTP-Code" : "Backup-Code"}</Label>
            <Input
              id="code"
              autoFocus
              inputMode={isTotp ? "numeric" : "text"}
              autoComplete="one-time-code"
              maxLength={isTotp ? 6 : 24}
              placeholder={isTotp ? "123456" : "xxxx-xxxx-xxxx"}
              value={code}
              onChange={(e) =>
                setCode(
                  isTotp
                    ? e.target.value.replace(/\D/g, "").slice(0, 6)
                    : e.target.value,
                )
              }
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button
            type="submit"
            className="w-full"
            disabled={loading || code.length === 0}
          >
            {loading ? "Prüfe…" : "Bestätigen"}
          </Button>
          <button
            type="button"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            onClick={() => {
              setMode(isTotp ? "backup" : "totp");
              setCode("");
              setError(null);
            }}
          >
            {isTotp ? "Backup-Code verwenden" : "Authenticator-App verwenden"}
          </button>
          <Link
            href="/login"
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            ← Zurück zur Anmeldung
          </Link>
        </CardFooter>
      </form>
    </Card>
  );
}
