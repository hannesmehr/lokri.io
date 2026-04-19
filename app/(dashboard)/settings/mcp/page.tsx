import { and, desc, eq, isNull } from "drizzle-orm";
import { Key, Plug } from "lucide-react";
import { getTranslations } from "next-intl/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { apiTokens, ownerAccounts, spaces } from "@/lib/db/schema";
import { resolveAppOrigin } from "@/lib/origin";
import { SettingsScopeHint } from "../_scope-hint";
import { SettingsTabs } from "../_tabs";
import { McpInstructions } from "./_mcp-instructions";
import { TokenList } from "./_token-list";
import { TokenCreateDialog } from "./_token-create-dialog";

export default async function McpPage() {
  const tHeader = await getTranslations("settings.mcp.pageHeader");
  const tLegacy = await getTranslations("settings.mcp.legacyTokens");
  const tInstructions = await getTranslations("settings.mcp.instructions");
  const tLayout = await getTranslations("settings");
  const { ownerAccountId, accountType, role } =
    await requireSessionWithAccount();
  const origin = resolveAppOrigin();

  const [tokens, spaceRows] = await Promise.all([
    db
      .select({
        id: apiTokens.id,
        name: apiTokens.name,
        tokenPrefix: apiTokens.tokenPrefix,
        scopeType: apiTokens.scopeType,
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

  const [account] = await db
    .select({ name: ownerAccounts.name })
    .from(ownerAccounts)
    .where(eq(ownerAccounts.id, ownerAccountId))
    .limit(1);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: tLayout("title"), href: "/settings/general" },
          { label: tLayout("navigation.mcp") },
        ]}
        title={tHeader("title")}
        description={tHeader("description")}
      />
      <SettingsTabs />
      <SettingsScopeHint
        accountType={accountType}
        accountName={account?.name ?? ""}
      />
      <div className="space-y-8">
        {/* inner spacing group — Cards sind größer spaced als das Header-Triple */}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-lg border bg-muted text-foreground">
                <Key className="h-4 w-4" />
              </div>
              <div>
                <CardTitle>{tLegacy("title")}</CardTitle>
                <CardDescription>{tLegacy("description")}</CardDescription>
              </div>
            </div>
            <TokenCreateDialog
              spaces={spaceRows}
              accountType={accountType}
              role={role}
            />
          </div>
        </CardHeader>
        <CardContent>
          <TokenList tokens={tokens} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg border bg-muted text-foreground">
              <Plug className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>{tInstructions("title")}</CardTitle>
              <CardDescription>{tInstructions("subtitle")}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <McpInstructions origin={origin} />
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
