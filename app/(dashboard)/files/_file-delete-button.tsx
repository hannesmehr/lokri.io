"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function FileDeleteButton({
  id,
  name,
  mobile = false,
}: {
  id: string;
  name: string;
  mobile?: boolean;
}) {
  const t = useTranslations("files.actions");
  const tToasts = useTranslations("toasts");
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onClick() {
    if (!confirm(t("deleteConfirm", { name }))) return;
    setLoading(true);
    const res = await fetch(`/api/files/${id}`, { method: "DELETE" });
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
      size={mobile ? "sm" : "sm"}
      onClick={onClick}
      disabled={loading}
      className={mobile ? "w-full justify-start gap-1.5 px-0 text-destructive hover:text-destructive" : "gap-1.5"}
    >
      <Trash2 className="h-3.5 w-3.5" />
      {t("delete")}
    </Button>
  );
}
