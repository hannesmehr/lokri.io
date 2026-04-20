/**
 * Gemeinsames Interface für Confluence-MCP-Tools.
 *
 * Pro Tool eine Datei (`search.ts`, `read-page.ts`, …) die genau ein
 * `ConfluenceTool`-Objekt exportiert. Der Provider dispatcht über
 * eine Map; der Tool-Handler in Block 3 importiert das Tool-Map
 * direkt, um `requiredScopes`/`extractObservedScopes` für den
 * Gateway-Call zu bekommen.
 *
 * Warum NICHT auf `ConnectorProvider` exposed:
 *   - Das Framework-Interface soll generisch bleiben (keine
 *     Tool-Metadata-Hooks; andere Connectors haben andere Anforderungen)
 *   - Der Block-3-Handler switcht sowieso per `connector_type`;
 *     dort kann er die konkrete Provider-Implementation kennen
 *
 * `args` ist bewusst `unknown` in `execute`. Die Validierung läuft
 * vor dem Dispatch via `argsSchema.parse(args)` — das Ergebnis wird
 * als `TArgs` gecastet und weitergereicht.
 */

import type { z } from "zod";
import type { ScopeRef } from "@/lib/connectors/filters";
import type { ExecutionContext, ToolResult } from "@/lib/connectors/types";
import type { ConfluenceCloudClient } from "../client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ConfluenceTool<TArgs = any> {
  readonly name: string;

  /** Zod-Schema. Der Provider parsiert args damit, bevor `execute`
   *  gerufen wird. */
  readonly argsSchema: z.ZodType<TArgs>;

  /**
   * Welche Scopes fasst dieser Tool-Call an? Vom Gateway als
   * `requiredScopes` an den Pre-Filter übergeben.
   *
   * - `search` → alle gescopten Spaces (CQL-Filter deckt sie alle ab)
   * - `list-recent` → alle (oder die expliziten subset args)
   * - `read-page` / `get-page-children` → **leeres Array** (Space ist
   *   erst nach dem Fetch bekannt; Post-Filter übernimmt)
   */
  requiredScopes(parsedArgs: TArgs, context: ExecutionContext): ScopeRef[];

  /**
   * Welche Scopes tauchen in der Response auf? Vom Gateway an den
   * Post-Filter übergeben. Leaks → `ConnectorScopePostError`.
   *
   * Konvention: jede Scope-Ref nur einmal (Dedup), type immer
   * `"confluence-space"`.
   */
  extractObservedScopes(result: ToolResult): ScopeRef[];

  /**
   * Führt den Upstream-Call aus und baut `ToolResult`. Wirft
   * Connector-Errors wie `ConnectorAuthError`, `ConnectorUpstreamError`
   * — der Gateway klassifiziert.
   */
  execute(
    client: ConfluenceCloudClient,
    parsedArgs: TArgs,
    context: ExecutionContext,
  ): Promise<ToolResult>;
}

// ---------------------------------------------------------------------------
// Shared helpers (verwendet von mehreren Tools)
// ---------------------------------------------------------------------------

/** Strippt HTML-Tags aus einem Excerpt zu Plain-Text. Minimal,
 *  nicht perfekt — reicht für MCP-Snippets. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extrahiert den Space-Key aus einem Confluence-`webui`-Pfad wie
 *  `/spaces/ENG/pages/123456/Page+Title`. Gibt `null` zurück, wenn
 *  das Muster nicht matcht (z.B. Personal-Space `~username` oder
 *  unerwartetes Format). */
export function extractSpaceKeyFromWebui(webui: string): string | null {
  const match = /^\/spaces\/([^/]+)(?:\/|$)/.exec(webui);
  return match ? decodeURIComponent(match[1]) : null;
}

/** Resolvt eine numerische Confluence-Space-ID gegen die Allowlist-
 *  Scopes im Context. Gibt den Space-Key zurück (= `scopeIdentifier`)
 *  oder `null`, wenn nicht in der Allowlist. Wird im Post-Filter
 *  gelesen → null ⇒ Scope-Leak. */
export function resolveSpaceIdToKey(
  spaceId: string,
  context: ExecutionContext,
): string | null {
  for (const scope of context.scopes) {
    const storedId = (scope.scopeMetadata as { spaceId?: string } | null)
      ?.spaceId;
    if (storedId === spaceId) return scope.scopeIdentifier;
  }
  return null;
}

/** Absoluter URL-Prefix für webui-Pfade (wiki-Pfad drangepackt). */
export function siteWikiPrefix(context: ExecutionContext): string {
  const siteUrl = (context.integration.config as { siteUrl?: string }).siteUrl;
  if (!siteUrl) return "";
  return `${siteUrl.replace(/\/+$/, "")}/wiki`;
}

/** Dedupliziert ScopeRefs anhand von `type + identifier`. */
export function uniqueScopeRefs(refs: ScopeRef[]): ScopeRef[] {
  const seen = new Set<string>();
  const out: ScopeRef[] = [];
  for (const ref of refs) {
    const key = `${ref.type}\u0000${ref.identifier}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
}
