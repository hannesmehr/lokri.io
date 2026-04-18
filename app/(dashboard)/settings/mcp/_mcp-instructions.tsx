"use client";

import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function CopyBlock({ label, snippet }: { label: string; snippet: string }) {
  const t = useTranslations("settings.mcp.instructions.shared");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);
  async function copy() {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    toast.success(t("copiedToast"));
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <Button variant="ghost" size="sm" onClick={copy}>
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copied ? t("copied") : t("copy")}
        </Button>
      </div>
      <pre
        className={cn(
          "overflow-x-auto rounded-md border bg-muted p-3 font-mono text-xs transition-colors",
          copied && "border-foreground/20 bg-card",
        )}
      >
        <code>{snippet}</code>
      </pre>
    </div>
  );
}

export function McpInstructions({ origin }: { origin: string }) {
  const tOauth = useTranslations("settings.mcp.oauth");
  const tShared = useTranslations("settings.mcp.instructions.shared");
  const tClaude = useTranslations("settings.mcp.instructions.claudeDesktop");
  const tChatgpt = useTranslations("settings.mcp.instructions.chatgpt");
  const tCursor = useTranslations("settings.mcp.instructions.cursor");
  const mcpUrl = `${origin}/api/mcp`;

  // Claude Desktop's config-file schema still requires a stdio subprocess
  // even when the remote supports OAuth. The `mcp-remote` bridge handles
  // OAuth discovery + PKCE for us — no `--header` or token to paste.
  const claudeDesktopSnippet = JSON.stringify(
    {
      mcpServers: {
        lokri: {
          command: "/absolute/path/to/node",
          args: ["/absolute/path/to/mcp-remote", mcpUrl],
        },
      },
    },
    null,
    2,
  );

  const chatgptSnippet = `URL: ${mcpUrl}
Auth: OAuth 2.1 (automatic — ChatGPT handles DCR + PKCE)
  OR: Bearer Token aus "MCP-Tokens" oben (Legacy-Pfad)
Tools: search, fetch, list_spaces, list_notes, list_files,
       create_note, update_note, delete_note, upload_file, delete_file`;

  const cursorSnippet = JSON.stringify(
    {
      mcpServers: {
        lokri: {
          url: mcpUrl,
          // Cursor supports OAuth auto-discovery; if it doesn't, fall back to:
          // headers: { Authorization: "Bearer lk_…" }
        },
      },
    },
    null,
    2,
  );

  return (
    <div className="space-y-6 text-sm">
      <div className="rounded-lg border-l-2 border-foreground/20 bg-muted px-4 py-3 text-xs text-foreground">
        <strong className="font-medium">{tOauth("title")}</strong>{" "}
        {tOauth("body")}
      </div>

      <section className="space-y-3">
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-semibold">{tClaude("title")}</h3>
          <span className="text-xs text-muted-foreground">
            {tClaude("badge")}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {tClaude("intro")} {tClaude("bridgeNote")}
        </p>
        <CopyBlock
          label={tClaude("copyLabel")}
          snippet={claudeDesktopSnippet}
        />
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">{tChatgpt("title")}</h3>
        <p className="text-xs text-muted-foreground">
          {tChatgpt("intro")} {tChatgpt("fallbackNote")}
        </p>
        <CopyBlock label={tChatgpt("copyLabel")} snippet={chatgptSnippet} />
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">{tCursor("title")}</h3>
        <p className="text-xs text-muted-foreground">
          {tCursor("intro")} {tCursor("fallbackNote")}
        </p>
        <CopyBlock label={tCursor("copyLabel")} snippet={cursorSnippet} />
      </section>

      <p className="text-xs text-muted-foreground">
        {tShared("endpoint")}:{" "}
        <code className="rounded bg-muted px-1 py-0.5">{mcpUrl}</code> ·
        {tShared("discovery")}:{" "}
        <code className="rounded bg-muted px-1 py-0.5">
          {origin}/.well-known/oauth-protected-resource
        </code>
      </p>
    </div>
  );
}
