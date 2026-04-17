"use client";

import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  /** Which collection to PATCH — determines URL. */
  kind: "notes" | "files";
  id: string;
  hidden: boolean;
  /** Optional compact style for list rows (smaller hit area). */
  compact?: boolean;
}

/**
 * Click-to-toggle eye icon. Hidden-for-MCP = eye-off; visible = eye.
 * Tooltip via native `title` keeps this dependency-free.
 */
export function McpHiddenToggle({ kind, id, hidden, compact }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState(hidden);

  async function flip(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    const next = !local;
    const res = await fetch(`/api/${kind}/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mcpHidden: next }),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error("Konnte Sichtbarkeit nicht ändern.");
      return;
    }
    setLocal(next);
    toast.success(
      next ? "Für MCP ausgeblendet." : "Für MCP wieder sichtbar.",
    );
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={flip}
      disabled={busy}
      title={
        local
          ? "Für MCP-Clients unsichtbar — klicken zum Einblenden"
          : "Für MCP-Clients sichtbar — klicken zum Ausblenden"
      }
      className={cn(
        "rounded-md transition-colors",
        compact ? "p-1" : "p-1.5",
        local
          ? "text-muted-foreground/70 hover:bg-muted hover:text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
      aria-label={local ? "Für MCP einblenden" : "Für MCP ausblenden"}
      aria-pressed={local}
    >
      {local ? (
        <EyeOff className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
      ) : (
        <Eye className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
      )}
    </button>
  );
}
