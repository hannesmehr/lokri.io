"use client";

import { useTranslations } from "next-intl";
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
  const t = useTranslations("settings.mcp.legacyTokens");
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);

  async function revoke(id: string, name: string) {
    if (!confirm(t("revokeConfirm", { name })))
      return;
    setPending(id);
    const res = await fetch(`/api/tokens/${id}`, { method: "DELETE" });
    setPending(null);
    if (!res.ok) {
      toast.error(t("revokeFailed"));
      return;
    }
    toast.success(t("revoked"));
    router.refresh();
  }

  if (tokens.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("empty")}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {tokens.map((token) => (
        <div
          key={token.id}
          className="flex items-start justify-between gap-4 rounded-md border p-3"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-2">
              <div className="font-medium">{token.name}</div>
              <code className="font-mono text-xs text-muted-foreground">
                {token.tokenPrefix}…
              </code>
              {token.readOnly ? (
                <span className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                  {t("readOnly")}
                </span>
              ) : null}
              {token.spaceScope && token.spaceScope.length > 0 ? (
                <span className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                  {token.spaceScope.length === 1
                    ? t("spaceScope", { count: token.spaceScope.length })
                    : t("spaceScopePlural", { count: token.spaceScope.length })}
                </span>
              ) : null}
              {token.scopeType === "team" ? (
                <span className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                  {t("teamWide")}
                </span>
              ) : null}
            </div>
            <div className="mt-1 font-mono text-xs text-muted-foreground">
              {t("createdAt", { date: new Date(token.createdAt).toLocaleDateString("de-DE") })} ·{" "}
              {token.lastUsedAt
                ? t("lastUsedAt", { datetime: new Date(token.lastUsedAt).toLocaleString("de-DE") })
                : t("neverUsed")}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending === token.id}
            onClick={() => revoke(token.id, token.name)}
            className="gap-1.5 text-destructive hover:text-destructive"
          >
            {t("revoke")}
          </Button>
        </div>
      ))}
    </div>
  );
}
