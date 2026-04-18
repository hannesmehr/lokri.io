"use client";

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("auth.twoFactor");
  const tCommon = useTranslations("errors.common");
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
      const rawCode =
        typeof err === "object" &&
        err &&
        "code" in err &&
        typeof err.code === "string"
          ? err.code
          : null;
      const message =
        rawCode === "INVALID_TOTP_CODE" ||
        rawCode === "invalid_totp_code" ||
        rawCode === "INVALID_BACKUP_CODE" ||
        rawCode === "invalid_backup_code" ||
        rawCode === "INVALID_TWO_FACTOR_CODE" ||
        rawCode === "invalid_two_factor_code"
          ? t("errors.invalidCode")
          : typeof err.message === "string" && err.message.length > 0
            ? err.message
            : tCommon("unknown");
      setError(message);
      return;
    }
    toast.success(t("success"));
    router.push("/dashboard");
    router.refresh();
  }

  const isTotp = mode === "totp";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-3xl font-semibold tracking-tight leading-tight">
          {t("title")}
        </CardTitle>
        <CardDescription>
          {isTotp ? t("descriptionTotp") : t("descriptionBackup")}
        </CardDescription>
      </CardHeader>
      <form onSubmit={submit}>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="code">
              {isTotp ? t("fieldLabelTotp") : t("fieldLabelBackup")}
            </Label>
            <Input
              id="code"
              autoFocus
              inputMode={isTotp ? "numeric" : "text"}
              autoComplete="one-time-code"
              maxLength={isTotp ? 6 : 24}
              placeholder={
                isTotp ? t("placeholders.totp") : t("placeholders.backup")
              }
              aria-label={
                isTotp ? t("fieldLabelTotp") : t("fieldLabelBackup")
              }
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
            {loading ? t("submitting") : t("submit")}
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
            {isTotp ? t("switchToBackup") : t("switchToTotp")}
          </button>
          <Link
            href="/login"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            <ArrowLeft className="h-3 w-3" />
            {t("backToLogin")}
          </Link>
        </CardFooter>
      </form>
    </Card>
  );
}
