"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
import { signIn } from "@/lib/auth-client";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("auth.login");
  const tErr = useTranslations("errors.common");
  const tSsoErr = useTranslations("errors.api.sso");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<1 | 2>(1);
  const [error, setError] = useState<string | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [redirectingToSso, setRedirectingToSso] = useState(false);

  const ssoError = searchParams.get("error");
  const ssoSuffix = ssoError?.startsWith("sso.") ? ssoError.split(".").pop() : null;
  const queryError =
    ssoSuffix && tSsoErr.has(ssoSuffix) ? tSsoErr(ssoSuffix) : null;

  async function onContinue(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setDiscovering(true);
    try {
      const res = await fetch(
        `/api/auth/sso-discovery?email=${encodeURIComponent(email)}`,
      );
      const body = (await res.json().catch(() => null)) as
        | { ssoEnabled?: boolean; signInUrl?: string; error?: string }
        | null;
      if (!res.ok) {
        setError(body?.error ?? tErr("unknown"));
        return;
      }
      if (body?.ssoEnabled && body.signInUrl) {
        setRedirectingToSso(true);
        window.setTimeout(() => {
          window.location.assign(body.signInUrl!);
        }, 1200);
        return;
      }
      setStep(2);
    } catch {
      setError(tErr("unknown"));
    } finally {
      setDiscovering(false);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSigningIn(true);
    const { error: signInError } = await signIn.email({
      email,
      password,
      callbackURL: "/dashboard",
    });
    setSigningIn(false);
    if (signInError) {
      setError(signInError.message ?? tErr("unknown"));
      return;
    }
    router.push("/dashboard");
  }

  return (
    <Card className="backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-3xl font-semibold tracking-tight leading-tight">
          {t("title")}
        </CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <form onSubmit={step === 1 ? onContinue : onSubmit}>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">{t("step1.emailLabel")}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={step === 2 || redirectingToSso}
            />
          </div>
          {redirectingToSso ? (
            <p className="text-sm text-muted-foreground" role="status">
              {t("step1.ssoRedirecting")}
            </p>
          ) : null}
          {step === 2 ? (
            <button
              type="button"
              className="w-fit text-xs text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => {
                setStep(1);
                setPassword("");
                setError(null);
              }}
            >
              {t("step2.editEmailLink")}
            </button>
          ) : null}
          {step === 2 ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="password">{t("step2.passwordLabel")}</Label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                >
                  {t("step2.forgotPasswordLink")}
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          ) : null}
          {queryError || error ? (
            <p className="text-sm text-destructive" role="alert">
              {queryError ?? error}
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button
            type="submit"
            className="w-full"
            disabled={discovering || signingIn || redirectingToSso}
          >
            {step === 1
              ? redirectingToSso
                ? t("step1.redirecting")
                : discovering
                ? t("step1.continuing")
                : t("step1.continueButton")
              : signingIn
                ? t("step2.submitting")
                : t("step2.submitButton")}
          </Button>
          <p className="text-sm text-muted-foreground">
            {t.rich("inviteHint", {
              contact: (chunks) => (
                <a
                  href="mailto:hello@lokri.io"
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  {chunks}
                </a>
              ),
            })}
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
