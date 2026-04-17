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
import { signUp } from "@/lib/auth-client";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: signUpError } = await signUp.email({
      name,
      email,
      password,
    });
    setLoading(false);
    if (signUpError) {
      setError(signUpError.message ?? "Registrierung fehlgeschlagen.");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Fast fertig</CardTitle>
          <CardDescription>
            Wir haben dir eine Verifizierungs-Email an{" "}
            <span className="font-medium text-foreground">{email}</span>{" "}
            geschickt. Klick den Link darin, um dein Konto zu aktivieren.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <p className="text-sm text-muted-foreground">
            Im Dev-Modus steht der Link direkt im Server-Log.
          </p>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registrieren</CardTitle>
        <CardDescription>
          Lege einen neuen lokri.io-Account an.
        </CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              type="text"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
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
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Passwort</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Mindestens 8 Zeichen.
            </p>
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Registrieren…" : "Account anlegen"}
          </Button>
          <p className="text-sm text-muted-foreground">
            Schon ein Account?{" "}
            <Link
              href="/login"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Anmelden
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
