"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function CopyBlock({ label, snippet }: { label: string; snippet: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);
  async function copy() {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    toast.success("In Zwischenablage kopiert.");
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
          {copied ? "Kopiert" : "Kopieren"}
        </Button>
      </div>
      <pre
        className={cn(
          "overflow-x-auto rounded-md border bg-muted/40 p-3 text-xs transition-colors",
          copied && "border-emerald-500/50 bg-emerald-500/5",
        )}
      >
        <code>{snippet}</code>
      </pre>
    </div>
  );
}

export function McpInstructions({ origin }: { origin: string }) {
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
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-900 dark:text-emerald-200">
        <strong className="font-medium">OAuth 2.1 aktiv.</strong> Clients
        discovern lokri über <code>/.well-known/oauth-protected-resource</code>,
        registrieren sich per DCR (RFC 7591) und tauschen PKCE-Codes gegen
        Access-Tokens. Du musst keinen Token manuell kopieren — die Tokens
        oben sind für Skripte/CLI (Legacy-Pfad).
      </div>

      <section className="space-y-3">
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-semibold">Claude Desktop</h3>
          <span className="text-xs text-muted-foreground">
            via <code>mcp-remote</code>-Bridge (OAuth)
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Einmalig <code>npm install -g mcp-remote</code>. Die config-file
          noch erlaubt Claude Desktop nur stdio-Subprozesse — <code>mcp-remote</code>{" "}
          bridged zu HTTP und macht die OAuth-Discovery selbst. Kein{" "}
          <code>--header</code>, kein Token nötig.
        </p>
        <CopyBlock
          label="claude_desktop_config.json"
          snippet={claudeDesktopSnippet}
        />
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">ChatGPT (Developer Tools)</h3>
        <p className="text-xs text-muted-foreground">
          MCP-Connector anlegen. ChatGPT discovert OAuth automatisch; falls
          es einen statischen Bearer erwartet, nutze einen Token aus{" "}
          <em>MCP-Tokens</em> oben.
        </p>
        <CopyBlock label="Connector-Settings" snippet={chatgptSnippet} />
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Cursor / Codex</h3>
        <p className="text-xs text-muted-foreground">
          In <code>~/.cursor/mcp.json</code> bzw. der Codex-MCP-Config.
          Cursor unterstützt OAuth-Discovery; falls nicht verfügbar, trage
          einen <code>Authorization: Bearer lk_…</code>-Header ein.
        </p>
        <CopyBlock label="mcp.json" snippet={cursorSnippet} />
      </section>

      <p className="text-xs text-muted-foreground">
        Endpoint:{" "}
        <code className="rounded bg-muted px-1 py-0.5">{mcpUrl}</code> ·
        Discovery:{" "}
        <code className="rounded bg-muted px-1 py-0.5">
          {origin}/.well-known/oauth-protected-resource
        </code>
      </p>
    </div>
  );
}
