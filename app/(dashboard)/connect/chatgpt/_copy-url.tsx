"use client";

import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Client-Island für den MCP-URL-Copy-Button auf `/connect/chatgpt`.
 *
 * Server-Page kann nichts selbst kopieren (kein navigator.clipboard).
 * Diese Mini-Komponente bleibt auf genau den Copy-Aspekt beschränkt —
 * Layout + Text bleiben im Server-Render.
 */
export function McpUrlCopyButton({ url }: { url: string }) {
  const t = useTranslations("connect.chatgpt");
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success(t("copied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy failed");
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? t("copied") : t("copy")}
      className="absolute right-2 top-2 inline-flex items-center gap-1 rounded border bg-background px-2 py-1 text-xs transition hover:border-foreground/40"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      <span>{copied ? t("copied") : t("copy")}</span>
    </button>
  );
}
