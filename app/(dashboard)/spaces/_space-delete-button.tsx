"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function SpaceDeleteButton({ id, name }: { id: string; name: string }) {
  const t = useTranslations("spaces.actions");
  const tToasts = useTranslations("toasts");
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onClick() {
    if (!confirm(t("deleteConfirm", { name })))
      return;
    setLoading(true);
    const res = await fetch(`/api/spaces/${id}`, { method: "DELETE" });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: tToasts("error.generic") }));
      toast.error(data.error || t("errors.deleteFailed"));
      return;
    }
    toast.success(t("deleted"));
    router.refresh();
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={loading}
      className="gap-1.5 text-destructive hover:text-destructive"
    >
      <Trash2 className="h-3.5 w-3.5" />
      {t("delete")}
    </Button>
  );
}
