import { AlertTriangle, ExternalLink, Sparkles } from "lucide-react";
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
import { requireSession } from "@/lib/api/session";
import { resolveAppOrigin } from "@/lib/origin";
import { McpUrlCopyButton } from "./_copy-url";

/**
 * ChatGPT/Codex-Setup — Anleitungs-UI.
 *
 * **Kein API-Endpoint, keine Form, kein Token-Kopieren.** ChatGPT spricht
 * über MCP + RFC 7591 (Dynamic Client Registration) direkt mit Better-
 * Auths `/api/auth/mcp/register` — der OAuth-Flow läuft komplett auto-
 * matisch.
 *
 * Lokri's Job hier: dem User die MCP-URL geben, erklären wohin er die
 * in ChatGPT einträgt, und vor der aktuellen OAuth-Scope-Limitierung
 * warnen (alle Spaces werden geteilt — Phase 2).
 */
export default async function ChatgptConnectPage() {
  await requireSession();
  const t = await getTranslations("connect.chatgpt");
  const tLanding = await getTranslations("connect.landing");

  const mcpUrl = `${resolveAppOrigin()}/api/mcp`;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: tLanding("title"), href: "/connect" },
          { label: tLanding("chatgpt.title") },
        ]}
        title={t("title")}
        description={t("description")}
      />

      <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-50 p-4 text-sm dark:bg-amber-950/30">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="space-y-1">
          <div className="font-medium text-amber-900 dark:text-amber-200">
            {t("scopeWarning.title")}
          </div>
          <p>{t("scopeWarning.body")}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("prereq.title")}</CardTitle>
          <CardDescription>{t("prereq.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>{t("prereq.plan")}</li>
            <li>{t("prereq.devMode")}</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("url.title")}</CardTitle>
          <CardDescription>{t("url.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <pre className="whitespace-pre-wrap break-all rounded-md border bg-muted/50 p-3 pr-24 font-mono text-sm">
              {mcpUrl}
            </pre>
            <McpUrlCopyButton url={mcpUrl} />
          </div>
          <p className="flex items-start gap-2 rounded border bg-muted/40 p-3 text-sm">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span>{t("url.oauthNote")}</span>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("steps.title")}</CardTitle>
          <CardDescription>{t("steps.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-3 pl-5 text-sm">
            <li>{t("steps.step1")}</li>
            <li>{t("steps.step2")}</li>
            <li>{t("steps.step3")}</li>
            <li>
              {t("steps.step4Part1")}{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                {mcpUrl}
              </code>{" "}
              {t("steps.step4Part2")}
            </li>
            <li>{t("steps.step5")}</li>
            <li>{t("steps.step6")}</li>
            <li>{t("steps.step7")}</li>
          </ol>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <a
          href="https://help.openai.com/en/articles/11487775-connectors-in-chatgpt"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          {t("externalHelp")}
          <ExternalLink className="h-3 w-3" />
        </a>
        <Link
          href="/dashboard"
          className={buttonVariants({ variant: "default" })}
        >
          {t("doneCta")}
        </Link>
      </div>
    </div>
  );
}
