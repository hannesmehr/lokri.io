"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface Token {
  id: string;
  name: string;
  tokenPrefix: string;
  scopeType?: "personal" | "team" | string | null;
  spaceScope: string[] | null;
  readOnly: boolean;
  lastUsedAt: Date | string | null;
  createdAt: Date | string;
}

export function TokenList({ tokens }: { tokens: Token[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);

  async function revoke(id: string, name: string) {
    if (!confirm(`Token "${name}" widerrufen? Clients verlieren sofort den Zugriff.`))
      return;
    setPending(id);
    const res = await fetch(`/api/tokens/${id}`, { method: "DELETE" });
    setPending(null);
    if (!res.ok) {
      toast.error("Konnte Token nicht widerrufen.");
      return;
    }
    toast.success("Token widerrufen.");
    router.refresh();
  }

  if (tokens.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Noch keine Tokens. Erstelle einen für deinen ersten Client.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {tokens.map((t) => (
        <div
          key={t.id}
          className="flex items-center justify-between gap-4 rounded-md border p-3"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-2">
              <div className="font-medium">{t.name}</div>
              <code className="text-xs text-muted-foreground">
                {t.tokenPrefix}…
              </code>
              {t.readOnly ? (
                <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                  read-only
                </span>
              ) : null}
              {t.spaceScope && t.spaceScope.length > 0 ? (
                <span className="rounded border border-indigo-500/30 bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 dark:text-indigo-300">
                  {t.spaceScope.length} Space
                  {t.spaceScope.length === 1 ? "" : "s"}
                </span>
              ) : null}
              {t.scopeType === "team" ? (
                <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                  team-wide
                </span>
              ) : null}
            </div>
            <div className="text-xs text-muted-foreground">
              Erstellt {new Date(t.createdAt).toLocaleDateString("de-DE")} ·{" "}
              {t.lastUsedAt
                ? `zuletzt genutzt ${new Date(t.lastUsedAt).toLocaleString("de-DE")}`
                : "nie genutzt"}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending === t.id}
            onClick={() => revoke(t.id, t.name)}
          >
            Widerrufen
          </Button>
        </div>
      ))}
    </div>
  );
}
