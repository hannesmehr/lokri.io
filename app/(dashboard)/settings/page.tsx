import { and, desc, eq, isNull } from "drizzle-orm";
import { Key, Plug } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { apiTokens } from "@/lib/db/schema";
import { McpInstructions } from "./_mcp-instructions";
import { TokenList } from "./_token-list";
import { TokenCreateDialog } from "./_token-create-dialog";

export default async function SettingsPage() {
  const { ownerAccountId } = await requireSessionWithAccount();
  const tokens = await db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      tokenPrefix: apiTokens.tokenPrefix,
      lastUsedAt: apiTokens.lastUsedAt,
      createdAt: apiTokens.createdAt,
    })
    .from(apiTokens)
    .where(
      and(
        eq(apiTokens.ownerAccountId, ownerAccountId),
        isNull(apiTokens.revokedAt),
      ),
    )
    .orderBy(desc(apiTokens.createdAt));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-4xl leading-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Verwalte deine MCP-Tokens und die Anbindung an KI-Clients.
        </p>
      </div>

      <Card className="overflow-hidden">
        <div className="absolute right-0 top-0 h-24 w-24 rounded-full bg-gradient-to-br from-indigo-500/15 to-fuchsia-500/10 blur-2xl" />
        <CardHeader className="relative">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-indigo-500/15 to-fuchsia-500/15 text-indigo-700 dark:text-indigo-300">
                <Key className="h-4 w-4" />
              </div>
              <div>
                <CardTitle>MCP-Tokens</CardTitle>
                <CardDescription>
                  Je ein Token pro KI-Client. Widerrufen sperrt den Zugriff
                  sofort.
                </CardDescription>
              </div>
            </div>
            <TokenCreateDialog />
          </div>
        </CardHeader>
        <CardContent className="relative">
          <TokenList tokens={tokens} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-emerald-500/15 to-teal-500/15 text-emerald-700 dark:text-emerald-400">
              <Plug className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>MCP-Verbindung einrichten</CardTitle>
              <CardDescription>
                Konfigurations-Snippets für Claude Desktop, ChatGPT und Cursor.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <McpInstructions />
        </CardContent>
      </Card>
    </div>
  );
}
