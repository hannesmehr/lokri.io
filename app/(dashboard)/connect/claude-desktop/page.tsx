import { desc, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { spaces as spacesTable } from "@/lib/db/schema";
import { resolveAppOrigin } from "@/lib/origin";
import { ClaudeDesktopWizard } from "./_wizard";

/**
 * Server-Shell für den Claude-Desktop-Setup-Wizard.
 *
 * Lädt die Spaces des aktuellen Owner-Accounts + baut das MCP-Endpoint-
 * URL-Prefix zusammen; der Client-Wizard bekommt beides als Props.
 */
export default async function ClaudeDesktopSetupPage() {
  const { session, ownerAccountId } = await requireSessionWithAccount({
    minRole: "member",
  });

  const [tLanding, tWizard, teamSpaces] = await Promise.all([
    getTranslations("connect.landing"),
    getTranslations("connect.claudeDesktop"),
    db
      .select({ id: spacesTable.id, name: spacesTable.name })
      .from(spacesTable)
      .where(eq(spacesTable.ownerAccountId, ownerAccountId))
      .orderBy(desc(spacesTable.updatedAt)),
  ]);

  const defaultName =
    session.user.name && session.user.name.trim().length > 0
      ? `Claude Desktop — ${session.user.name.trim()}`
      : "Claude Desktop";
  const mcpUrl = `${resolveAppOrigin()}/api/mcp`;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: tLanding("title"), href: "/connect" },
          { label: tWizard("breadcrumb") },
        ]}
        title={tWizard("title")}
        description={tWizard("description")}
      />
      <ClaudeDesktopWizard
        teamSpaces={teamSpaces}
        defaultName={defaultName}
        mcpUrl={mcpUrl}
      />
    </div>
  );
}
