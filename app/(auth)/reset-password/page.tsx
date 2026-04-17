"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
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

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  );
}

function ResetPasswordInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <Card className="backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="font-display text-3xl leading-tight">
            Ungültiger Link
          </CardTitle>
          <CardDescription>
            Der Reset-Link fehlt oder ist abgelaufen. Fordere einen neuen an.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Link
            href="/forgot-password"
            className="text-sm underline-offset-4 hover:underline"
          >
            Neuen Link anfordern
          </Link>
        </CardFooter>
      </Card>
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }
    if (password.length < 8) {
      setError("Mindestens 8 Zeichen.");
      return;
    }
    setLoading(true);
    const { error: rpError } = await authClient.resetPassword({
      newPassword: password,
      token: token!,
    });
    setLoading(false);
    if (rpError) {
      setError(
        rpError.message ??
          "Reset fehlgeschlagen — der Link ist vermutlich abgelaufen.",
      );
      return;
    }
    toast.success("Passwort aktualisiert. Melde dich jetzt an.");
    router.push("/login");
  }

  return (
    <Card className="backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="font-display text-3xl leading-tight">
          Neues Passwort
        </CardTitle>
        <CardDescription>
          Wähle ein neues Passwort. Mindestens 8 Zeichen.
        </CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Neues Passwort</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm">Bestätigen</Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Speichere…" : "Passwort setzen"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
