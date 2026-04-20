import { and, desc, eq, isNull } from "drizzle-orm";
import { Key } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
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
import {
  apiTokens,
  auditEvents,
  ownerAccounts,
  spaces,
} from "@/lib/db/schema";
import { SettingsScopeHint } from "../_scope-hint";
import { SettingsTabs } from "../_tabs";
import { TokenList } from "./_token-list";
import { TokenCreateDialog } from "./_token-create-dialog";

export default async function McpPage() {
  const tHeader = await getTranslations("settings.mcp.pageHeader");
  const tLegacy = await getTranslations("settings.mcp.legacyTokens");
  const tLayout = await getTranslations("settings");
  const tConnect = await getTranslations("settings.mcp.connectPromo");
  const { ownerAccountId, accountType, role } =
    await requireSessionWithAccount();

  // createdVia aus audit_events rekonstruieren — die /connect-Flows
  // schreiben ein `user.connect.token_created`-Event mit
  // `metadata.clientType`. LEFT JOIN + DISTINCT ON (targetId) würde in
  // Drizzle umständlich; wir machen eine Sub-Select auf den aktuellsten
  // Event pro Token. Für MVP reicht: tokens-list mit JOIN, ein Token
  // hat höchstens einen `user.connect.token_created`-Event (schreibt
  // sich beim Create einmal).
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
        createdViaMeta: auditEvents.metadata,
      })
      .from(apiTokens)
      .leftJoin(
        auditEvents,
        and(
          eq(auditEvents.targetId, apiTokens.id),
          eq(auditEvents.action, "user.connect.token_created"),
        ),
      )
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

  // createdVia aus der metadata-jsonb ziehen — type-safe, null-tolerant.
  const tokensWithOrigin = tokens.map((t) => {
    const meta = t.createdViaMeta as
      | { clientType?: string }
      | null
      | undefined;
    const clientType = meta?.clientType ?? null;
    // Ab hier droppen wir createdViaMeta (Raw-JSON soll nicht in Props).
    return {
      id: t.id,
      name: t.name,
      tokenPrefix: t.tokenPrefix,
      scopeType: t.scopeType,
      spaceScope: t.spaceScope,
      readOnly: t.readOnly,
      lastUsedAt: t.lastUsedAt,
      createdAt: t.createdAt,
      createdVia: clientType,
    };
  });

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

      {/* Pointer zum geführten Setup-Wizard. Ersetzt die alte
          McpInstructions-Card (manuelle Config-Snippets), die durch den
          /connect-Flow obsolet wurde. */}
      <Card className="border-dashed">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle>{tConnect("title")}</CardTitle>
              <CardDescription>{tConnect("description")}</CardDescription>
            </div>
            <Link
              href="/connect"
              className={buttonVariants({ variant: "default" })}
            >
              {tConnect("cta")}
            </Link>
          </div>
        </CardHeader>
      </Card>

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
          <TokenList tokens={tokensWithOrigin} />
        </CardContent>
      </Card>

      </div>
    </div>
  );
}
