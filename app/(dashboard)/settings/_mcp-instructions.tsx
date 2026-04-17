"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function CopyBlock({
  label,
  snippet,
}: {
  label: string;
  snippet: string;
}) {
  const [, setTick] = useState(0);
  async function copy() {
    await navigator.clipboard.writeText(snippet);
    toast.success("In Zwischenablage kopiert.");
    setTick((n) => n + 1);
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase text-muted-foreground">
          {label}
        </span>
        <Button variant="ghost" size="sm" onClick={copy}>
          Kopieren
        </Button>
      </div>
      <pre className="overflow-x-auto rounded-md border bg-muted/50 p-3 text-xs">
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
          type: "http",
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
    <Card>
      <CardHeader>
        <CardTitle>MCP-Verbindung</CardTitle>
        <CardDescription>
          Generiere oben einen Token, ersetze im Snippet{" "}
          <code className="text-xs">lk_DEIN_TOKEN_HIER</code> und trage die
          Konfiguration in deinem Client ein.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Claude Desktop</h3>
          <p className="text-xs text-muted-foreground">
            In <code>~/Library/Application Support/Claude/claude_desktop_config.json</code>{" "}
            (macOS) bzw. <code>%APPDATA%\Claude\claude_desktop_config.json</code>{" "}
            (Windows). Neustart des Clients danach.
          </p>
          <CopyBlock label="claude_desktop_config.json" snippet={claudeDesktopSnippet} />
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">ChatGPT (Developer Tools)</h3>
          <p className="text-xs text-muted-foreground">
            Im ChatGPT MCP-Setup als "Custom connector" anlegen. Pflicht-Tools{" "}
            <code>search</code> und <code>fetch</code> sind bereits implementiert.
          </p>
          <CopyBlock label="Connector-Settings" snippet={chatgptSnippet} />
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Cursor / Codex</h3>
          <p className="text-xs text-muted-foreground">
            In <code>~/.cursor/mcp.json</code> (Cursor) bzw. Codex-MCP-Config.
          </p>
          <CopyBlock label="mcp.json" snippet={cursorSnippet} />
        </section>

        <p className="text-xs text-muted-foreground">
          Endpoint-URL: <code>{mcpUrl}</code>
        </p>
      </CardContent>
    </Card>
  );
}
