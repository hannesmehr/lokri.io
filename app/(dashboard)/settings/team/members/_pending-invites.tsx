"use client";

import { Loader2, XCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n/config";
import { formatDate } from "@/lib/i18n/formatters";

interface PendingInvite {
  id: string;
  email: string;
  role: "admin" | "member" | "viewer";
  invitedByName: string | null;
  expiresAt: string;
  createdAt: string;
}

export function PendingInvites({
  teamId,
  invites,
}: {
  teamId: string;
  invites: PendingInvite[];
}) {
  const router = useRouter();
  const locale = useLocale() as Locale;
  const t = useTranslations("settings.team.invites");
  const tRoles = useTranslations("enums.role");
  const [busy, setBusy] = useState<string | null>(null);

  async function revoke(inv: PendingInvite) {
    if (!confirm(t("revokeConfirm", { email: inv.email }))) return;
    setBusy(inv.id);
    const res = await fetch(`/api/teams/${teamId}/invites/${inv.id}`, {
      method: "DELETE",
    });
    setBusy(null);
    if (!res.ok) {
      toast.error(t("revoked"));
      return;
    }
    toast.success(t("revoked"));
    router.refresh();
  }

  if (invites.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <ul className="divide-y">
      {invites.map((inv) => (
        <li
          key={inv.id}
          className="flex flex-wrap items-center gap-3 py-3 text-sm"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{inv.email}</span>
              <span className="rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {tRoles(inv.role)}
              </span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {inv.invitedByName
                ? t("invitedBy", { name: inv.invitedByName }) + " · "
                : ""}
              {t("expiresAt", { date: formatDate(inv.expiresAt, locale) })}
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy === inv.id}
            onClick={() => void revoke(inv)}
          >
            {busy === inv.id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <XCircle className="h-3.5 w-3.5" />
            )}
            {t("revoke")}
          </Button>
        </li>
      ))}
    </ul>
  );
}
