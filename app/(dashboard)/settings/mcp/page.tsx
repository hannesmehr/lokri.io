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
import { apiTokens, spaces } from "@/lib/db/schema";
import { resolveAppOrigin } from "@/lib/origin";
import { McpInstructions } from "./_mcp-instructions";
import { TokenList } from "./_token-list";
import { TokenCreateDialog } from "./_token-create-dialog";

export default async function McpPage() {
  const { ownerAccountId } = await requireSessionWithAccount();
  const origin = resolveAppOrigin();

  const [tokens, spaceRows] = await Promise.all([
    db
      .select({
        id: apiTokens.id,
        name: apiTokens.name,
        tokenPrefix: apiTokens.tokenPrefix,
        spaceScope: apiTokens.spaceScope,
        readOnly: apiTokens.readOnly,
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
      .orderBy(desc(apiTokens.createdAt)),
    db
      .select({ id: spaces.id, name: spaces.name })
      .from(spaces)
      .where(eq(spaces.ownerAccountId, ownerAccountId))
      .orderBy(desc(spaces.updatedAt)),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-4xl leading-tight">MCP</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Verbinde Claude Desktop, ChatGPT, Cursor oder andere MCP-Clients mit
          deinem lokri-Account.
        </p>
      </div>

      <Card className="overflow-hidden relative">
        <div className="absolute right-0 top-0 h-24 w-24 rounded-full bg-gradient-to-br from-indigo-500/15 to-fuchsia-500/10 blur-2xl" />
        <CardHeader className="relative">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-indigo-500/15 to-fuchsia-500/15 text-indigo-700 dark:text-indigo-300">
                <Key className="h-4 w-4" />
              </div>
              <div>
                <CardTitle>Legacy-Bearer-Tokens</CardTitle>
                <CardDescription>
                  Statische Tokens für Skripte und CLI-Integrationen. Moderne
                  Clients nutzen stattdessen OAuth (siehe unten).
                </CardDescription>
              </div>
            </div>
            <TokenCreateDialog spaces={spaceRows} />
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
              <CardTitle>Client einrichten</CardTitle>
              <CardDescription>
                Copy-&amp;-Paste-Snippets für Claude Desktop, ChatGPT, Cursor.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <McpInstructions origin={origin} />
        </CardContent>
      </Card>
    </div>
  );
}
