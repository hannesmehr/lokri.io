"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function NoteDeleteButton({
  id,
  title,
}: {
  id: string;
  title?: string;
}) {
  const t = useTranslations("notes.actions");
  const tToasts = useTranslations("toasts");
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onClick() {
    if (
      !confirm(
        title
          ? t("deleteConfirmWithTitle", { title })
          : t("deleteConfirm"),
      )
    )
      return;
    setLoading(true);
    const res = await fetch(`/api/notes/${id}`, { method: "DELETE" });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: tToasts("error.generic") }));
      toast.error(data.error || t("errors.deleteFailed"));
      return;
    }
    toast.success(t("deleted"));
    router.push("/notes");
    router.refresh();
  }

  return (
    <Button
      variant="destructive"
      size="sm"
      onClick={onClick}
      disabled={loading}
      className="gap-1.5"
    >
      <Trash2 className="h-3.5 w-3.5" />
      {t("delete")}
    </Button>
  );
}
