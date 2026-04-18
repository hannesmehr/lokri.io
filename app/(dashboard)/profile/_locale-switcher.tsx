"use client";

import { Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { locales, type Locale } from "@/lib/i18n/config";

/**
 * Profile-page language switcher. Writes `users.preferred_locale` via
 * `PATCH /api/profile/locale` (which also refreshes the cookie), then
 * `router.refresh()` to re-render the current page in the new locale.
 *
 * Intentionally minimal UI — a short label + native select. We don't
 * need a full-blown combobox here.
 */
export function LocaleSwitcher() {
  const router = useRouter();
  const active = useLocale() as Locale;
  const t = useTranslations("profile.locale");
  const tToasts = useTranslations("toasts");
  const [value, setValue] = useState<Locale>(active);
  const [isPending, startTransition] = useTransition();

  async function save(next: Locale) {
    setValue(next);
    const res = await fetch("/api/profile/locale", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ locale: next }),
    });
    if (!res.ok) {
      toast.error(tToasts("error.generic"));
      setValue(active);
      return;
    }
    toast.success(t("saved"));
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Languages className="h-4 w-4 text-muted-foreground" />
        <Label htmlFor="locale-select">{t("label")}</Label>
      </div>
      <select
        id="locale-select"
        value={value}
        onChange={(e) => void save(e.target.value as Locale)}
        disabled={isPending}
        className="flex h-9 w-full max-w-xs rounded-md border bg-background px-3 text-sm"
        aria-label={t("label")}
      >
        {locales.map((loc) => (
          <option key={loc} value={loc}>
            {t(`options.${loc}`)}
          </option>
        ))}
      </select>
    </div>
  );
}
