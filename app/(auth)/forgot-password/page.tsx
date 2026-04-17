"use client";

import Link from "next/link";
import { useState } from "react";
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

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: fpError } = await authClient.requestPasswordReset({
      email,
      redirectTo: "/reset-password",
    });
    setLoading(false);
    if (fpError) {
      setError(fpError.message ?? "Konnte Reset-Link nicht senden.");
      return;
    }
    // Immer "Done" anzeigen, auch wenn die Email nicht existiert — verhindert
    // User-Enumeration.
    setDone(true);
  }

  if (done) {
    return (
      <Card className="backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="font-display text-3xl leading-tight">
            Check deine Mails
          </CardTitle>
          <CardDescription>
            Falls ein Account mit <span className="font-medium text-foreground">{email}</span>{" "}
            existiert, haben wir einen Reset-Link geschickt. Der Link ist 1 Stunde
            gültig.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Link
            href="/login"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            ← Zurück zur Anmeldung
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="font-display text-3xl leading-tight">
          Passwort vergessen
        </CardTitle>
        <CardDescription>
          Wir schicken dir einen Link, mit dem du ein neues Passwort setzen
          kannst.
        </CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Sende…" : "Reset-Link schicken"}
          </Button>
          <Link
            href="/login"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            ← Zurück zur Anmeldung
          </Link>
        </CardFooter>
      </form>
    </Card>
  );
}
