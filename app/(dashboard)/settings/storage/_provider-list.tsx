"use client";

import { CloudCog, FolderGit2, HardDrive, Trash2 } from "lucide-react";
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
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function onCreated(p: Provider) {
    setItems((xs) => [...xs, p]);
    router.refresh();
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Provider "${name}" wirklich entfernen?`)) return;
    setDeleting(id);
    const res = await fetch(`/api/storage-providers/${id}`, {
      method: "DELETE",
    });
    setDeleting(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Fehler" }));
      toast.error(data.error ?? "Konnte nicht löschen.");
      return;
    }
    setItems((xs) => xs.filter((x) => x.id !== id));
    toast.success("Provider entfernt.");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* Internal — always present, not deletable */}
      <div className="rounded-xl border p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-indigo-500/15 to-fuchsia-500/15 text-indigo-700 dark:text-indigo-300">
              <HardDrive className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">lokri-managed (Vercel Blob)</span>
                <Badge variant="secondary" className="text-[10px]">
                  Standard
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                Default für alle Uploads ohne Space-spezifische Zuweisung.
                Immer verfügbar, nicht löschbar.
              </div>
            </div>
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Noch keine externen Provider. Lege einen an — dann kannst du ihn
          einzelnen Spaces zuweisen.
        </p>
      ) : (
        <div className="divide-y rounded-xl border">
          {items.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
            >
              <div className="flex items-center gap-3">
                <div
                  className={
                    p.type === "github"
                      ? "grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-slate-600/20 to-slate-900/20 text-slate-700 dark:text-slate-200"
                      : "grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-emerald-500/15 to-teal-500/15 text-emerald-700 dark:text-emerald-400"
                  }
                >
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
                      <Badge variant="secondary" className="text-[10px]">
                        read-only
                      </Badge>
                    ) : null}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {p.type.toUpperCase()} · angelegt{" "}
                    {formatDateTime(p.createdAt)}
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
                Entfernen
              </Button>
            </div>
          ))}
        </div>
      )}

      <AddProviderDialog onCreated={onCreated} />
    </div>
  );
}
