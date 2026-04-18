"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function TeamNameForm({
  teamId,
  initialName,
  canEdit,
}: {
  teamId: string;
  initialName: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const t = useTranslations("settings.team.overview");
  const tTeamErrors = useTranslations("errors.api.team");
  const tErr = useTranslations("errors.common");
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canEdit) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === initialName) return;
    setBusy(true);
    const res = await fetch(`/api/teams/${teamId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const suffix =
        typeof body?.details?.code === "string"
          ? body.details.code.split(".").pop() ?? null
          : null;
      const message =
        suffix && tTeamErrors.has(suffix)
          ? tTeamErrors(suffix)
          : body?.error ?? tErr("unknown");
      toast.error(message);
      return;
    }
    toast.success(t("nameSaved"));
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 md:flex-row md:items-end">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={200}
        disabled={!canEdit || busy}
        autoComplete="off"
        className="max-w-xl border-muted-foreground/20 focus-visible:border-foreground/30"
        aria-label={t("nameInputLabel")}
      />
      {canEdit ? (
        <Button type="submit" disabled={busy || name.trim() === initialName}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {t("nameSave")}
        </Button>
      ) : null}
    </form>
  );
}
