"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Client island for the accept-page. Triggers the POST, maps the
 * InviteError codes back to readable toasts, and redirects into the
 * fresh team context on success.
 */
export function AcceptInviteButton({ token }: { token: string }) {
  const router = useRouter();
  const t = useTranslations("invites.accept");
  const [busy, setBusy] = useState(false);

  async function accept() {
    setBusy(true);
    const res = await fetch("/api/invites/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) {
      setBusy(false);
      const body = await res.json().catch(() => ({}));
      const code = (body?.details?.code as string | undefined) ?? "generic";
      toast.error(translateError(t, code));
      return;
    }
    const body = (await res.json()) as { teamName?: string };
    toast.success(t("successToast", { teamName: body.teamName ?? "" }));
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <Button onClick={accept} disabled={busy} className="w-full">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {busy ? t("submitting") : t("submit")}
    </Button>
  );
}

type InviteErrorT = ReturnType<typeof useTranslations<"invites.accept">>;

function translateError(t: InviteErrorT, code: string): string {
  switch (code) {
    case "INVALID_TOKEN":
      return t("errors.invalidToken");
    case "EXPIRED":
      return t("errors.expired");
    case "EMAIL_MISMATCH":
      return t("errors.emailMismatch");
    case "ALREADY_MEMBER":
      return t("errors.alreadyMember");
    default:
      return t("errors.generic");
  }
}
