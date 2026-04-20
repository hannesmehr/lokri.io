import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireSession } from "@/lib/api/session";

/**
 * `/connect` — Onboarding-Landing für MCP-Client-Setup.
 *
 * Zwei Karten-Optionen:
 *   1. Claude Desktop — lokale App, Bearer-Token-Setup via Wizard
 *   2. ChatGPT / Codex — OAuth-Flow, lokri macht nur Anleitung
 *
 * Kein Top-Level-Nav-Entry (zu prominent für einmaligen Flow) — die
 * Entries kommen in Block 3 als Dashboard-Card und Link aus
 * `/settings/mcp`.
 */
export default async function ConnectLandingPage() {
  await requireSession();
  const t = await getTranslations("connect.landing");

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/connect/claude-desktop"
          className="group rounded-lg border bg-card text-card-foreground transition hover:border-foreground/20 hover:shadow-sm"
        >
          <Card className="border-0 shadow-none">
            <CardHeader>
              <div className="mb-3 h-10 w-10 rounded-lg bg-orange-100 dark:bg-orange-950/40 flex items-center justify-center">
                <AnthropicIcon />
              </div>
              <CardTitle>{t("claude.title")}</CardTitle>
              <CardDescription>{t("claude.description")}</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {t("claude.note")}
            </CardContent>
          </Card>
        </Link>

        <Link
          href="/connect/chatgpt"
          className="group rounded-lg border bg-card text-card-foreground transition hover:border-foreground/20 hover:shadow-sm"
        >
          <Card className="border-0 shadow-none">
            <CardHeader>
              <div className="mb-3 h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center">
                <OpenAIIcon />
              </div>
              <CardTitle>{t("chatgpt.title")}</CardTitle>
              <CardDescription>{t("chatgpt.description")}</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {t("chatgpt.note")}
            </CardContent>
          </Card>
        </Link>
      </div>

      <p className="text-sm text-muted-foreground">{t("moreClients")}</p>
    </div>
  );
}

function AnthropicIcon() {
  // Einfaches Mono-Logo — keine externe Asset-Dependency.
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-5 w-5 text-orange-700 dark:text-orange-300"
      aria-hidden
    >
      <path
        d="M14.5 4h3l5 16h-3.2l-4.8-16Zm-8 0H10l5 16h-3.2l-0.9-3H5.4l-.9 3H1.3l5.2-16Zm.9 4.2-1.6 5.8h3.2L8.4 8.2Z"
        fill="currentColor"
      />
    </svg>
  );
}

function OpenAIIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-5 w-5 text-emerald-700 dark:text-emerald-300"
      aria-hidden
    >
      <path
        d="M12 2a6 6 0 0 1 5.2 9 6 6 0 0 1-5.2 9 6 6 0 0 1-5.2-9A6 6 0 0 1 12 2Zm0 3.4-4.9 2.8v5.6L12 16.6l4.9-2.8V8.2L12 5.4Z"
        fill="currentColor"
      />
    </svg>
  );
}
