"use client";

import { useTranslations } from "next-intl";
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
  const t = useTranslations("auth.forgotPassword");
  const tErr = useTranslations("errors.common");
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
      setError(fpError.message ?? tErr("unknown"));
      return;
    }
    // Always show "Done" even if the account doesn't exist — prevents
    // user enumeration.
    setDone(true);
  }

  if (done) {
    return (
      <Card className="backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="font-display text-3xl leading-tight">
            {t("sentTitle")}
          </CardTitle>
          <CardDescription>
            {t.rich("sentBody", {
              email: () => (
                <span className="font-medium text-foreground">{email}</span>
              ),
            })}
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Link
            href="/login"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            {t("backToLogin")}
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="font-display text-3xl leading-tight">
          {t("title")}
        </CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">{t("email")}</Label>
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
            {loading ? t("submitting") : t("submit")}
          </Button>
          <Link
            href="/login"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            {t("backToLogin")}
          </Link>
        </CardFooter>
      </form>
    </Card>
  );
}
