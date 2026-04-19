"use client";

import { Info, X } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { getSsoAvailableBannerStorageKey } from "@/lib/auth/sso-banner";

export function SsoAvailableBanner({
  ownerAccountId,
}: {
  ownerAccountId: string;
}) {
  const t = useTranslations("dashboard.banner.ssoAvailable");
  const storageKey = useMemo(
    () => getSsoAvailableBannerStorageKey(ownerAccountId),
    [ownerAccountId],
  );
  const [dismissed, setDismissed] = useState(() => {
    try {
      if (typeof window === "undefined") return true;
      return window.localStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  });

  function dismiss() {
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {}
    setDismissed(true);
  }

  if (dismissed) return null;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-brand/30 bg-brand/5 p-4">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium">{t("title")}</p>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
        <Link
          href="/team/security"
          className="inline-flex text-sm font-medium underline-offset-4 hover:underline"
        >
          {t("learnMore")}
        </Link>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={dismiss}
        aria-label={t("dismiss")}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
