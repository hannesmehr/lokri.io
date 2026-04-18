"use client";

import { CloudCog, FolderGit2, HardDrive, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { AddProviderDialog } from "./_add-provider-dialog";

interface Provider {
  id: string;
  name: string;
  type: "s3" | "github";
  createdAt: Date | string;
}

export function ProviderList({ initial }: { initial: Provider[] }) {
  const t = useTranslations("settings.storage");
  const tErrors = useTranslations("errors.api.storageProvider");
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function onCreated(p: Provider) {
    setItems((xs) => [...xs, p]);
    router.refresh();
  }

  async function remove(id: string, name: string) {
    if (!confirm(t("list.removeConfirm", { name }))) return;
    setDeleting(id);
    const res = await fetch(`/api/storage-providers/${id}`, {
      method: "DELETE",
    });
    setDeleting(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      // Shared Phase-2 pattern: prefer structured API codes, fall back to raw error text.
      const suffix =
        typeof body?.details?.code === "string"
          ? body.details.code.split(".").pop()
          : null;
      const message =
        suffix && tErrors.has(suffix)
          ? tErrors(suffix)
          : body?.error ?? t("list.errors.generic");
      toast.error(message);
      return;
    }
    setItems((xs) => xs.filter((x) => x.id !== id));
    toast.success(t("list.removed"));
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* Internal — always present, not deletable */}
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg border bg-muted text-foreground">
              <HardDrive className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{t("internal.name")}</span>
                <Badge
                  variant="secondary"
                  className="bg-muted text-[10px] text-foreground"
                >
                  {t("internal.default")}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                {t("internal.description")}
              </div>
            </div>
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("list.empty")}
        </p>
      ) : (
        <div className="divide-y rounded-xl border">
          {items.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:border-foreground/20 hover:bg-muted/20"
            >
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-lg border bg-muted text-foreground">
                  {p.type === "github" ? (
                    <FolderGit2 className="h-4 w-4" />
                  ) : (
                    <CloudCog className="h-4 w-4" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{p.name}</span>
                    {p.type === "github" ? (
                      <Badge
                        variant="secondary"
                        className="bg-muted text-[10px] text-foreground"
                      >
                        {t("list.readOnly")}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("list.createdAt", {
                      type: p.type.toUpperCase(),
                      date: formatDateTime(p.createdAt),
                    })}
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={deleting === p.id}
                onClick={() => remove(p.id, p.name)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t("list.remove")}
              </Button>
            </div>
          ))}
        </div>
      )}

      <AddProviderDialog onCreated={onCreated} />
    </div>
  );
}
