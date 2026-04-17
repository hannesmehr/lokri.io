"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface Token {
  id: string;
  name: string;
  tokenPrefix: string;
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
            <div className="flex items-baseline gap-2">
              <div className="font-medium">{t.name}</div>
              <code className="text-xs text-muted-foreground">
                {t.tokenPrefix}…
              </code>
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
