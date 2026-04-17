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

export function McpInstructions() {
  const mcpUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/mcp`
      : "https://your-domain/api/mcp";

  const claudeDesktopSnippet = JSON.stringify(
    {
      mcpServers: {
        lokri: {
          command: "/absolute/path/to/node",
          args: [
            "/absolute/path/to/mcp-remote",
            mcpUrl,
            "--header",
            "Authorization:Bearer lk_DEIN_TOKEN_HIER",
          ],
        },
      },
    },
    null,
    2,
  );

  const chatgptSnippet = `URL: ${mcpUrl}
Auth: Bearer Token (lk_DEIN_TOKEN_HIER)
Tools: search, fetch, list_spaces, list_notes, list_files, create_note, update_note, delete_note, upload_file, delete_file`;

  const cursorSnippet = JSON.stringify(
    {
      mcpServers: {
        lokri: {
          url: mcpUrl,
          headers: {
            Authorization: "Bearer lk_DEIN_TOKEN_HIER",
          },
        },
      },
    },
    null,
    2,
  );

  return (
    <div className="space-y-6 text-sm">
      <p className="text-muted-foreground">
        Erstelle oben einen Token, ersetze im Snippet{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">
          lk_DEIN_TOKEN_HIER
        </code>{" "}
        und übernimm die Konfiguration in deinem Client.
      </p>

      <section className="space-y-3">
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-semibold">Claude Desktop</h3>
          <span className="text-xs text-muted-foreground">
            via <code>mcp-remote</code> stdio-Bridge
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Einmalig <code>npm install -g mcp-remote</code>, dann in{" "}
          <code>~/Library/Application Support/Claude/claude_desktop_config.json</code>{" "}
          (macOS) bzw.{" "}
          <code>%APPDATA%\Claude\claude_desktop_config.json</code> (Windows).
          Pfade zu <code>node</code> und <code>mcp-remote</code> absolut
          eintragen (nvm-Nutzer: die aktuelle Version erzwingen).
        </p>
        <CopyBlock
          label="claude_desktop_config.json"
          snippet={claudeDesktopSnippet}
        />
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">ChatGPT (Developer Tools)</h3>
        <p className="text-xs text-muted-foreground">
          MCP-Connector anlegen. Pflicht-Tools <code>search</code> und{" "}
          <code>fetch</code> sind implementiert.
        </p>
        <CopyBlock label="Connector-Settings" snippet={chatgptSnippet} />
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Cursor / Codex</h3>
        <p className="text-xs text-muted-foreground">
          In <code>~/.cursor/mcp.json</code> (Cursor) bzw. der Codex-MCP-Config.
        </p>
        <CopyBlock label="mcp.json" snippet={cursorSnippet} />
      </section>

      <p className="text-xs text-muted-foreground">
        Endpoint-URL:{" "}
        <code className="rounded bg-muted px-1 py-0.5">{mcpUrl}</code>
      </p>
    </div>
  );
}
