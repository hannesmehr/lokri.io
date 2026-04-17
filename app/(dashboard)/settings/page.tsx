import { and, desc, eq, isNull } from "drizzle-orm";
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
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Verwalte deine MCP-Tokens und die Anbindung an KI-Clients.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>MCP-Tokens</CardTitle>
              <CardDescription>
                Je ein Token pro KI-Client. Du kannst Tokens jederzeit
                widerrufen.
              </CardDescription>
            </div>
            <TokenCreateDialog />
          </div>
        </CardHeader>
        <CardContent>
          <TokenList tokens={tokens} />
        </CardContent>
      </Card>

      <McpInstructions />
    </div>
  );
}
