/**
 * `search` — Unified-Search über alle gescopten Confluence-Spaces.
 *
 * Endpoint: v1 `/wiki/rest/api/search?cql=…&limit=…&expand=content.space,content.history.lastUpdated`
 *
 * v1 statt v2, weil CQL das einzig mächtige Query-Model bei
 * Confluence ist (boolean, space-Filter, type-Filter, text-Match in
 * einem Query-String). v2 hat keinen CQL-äquivalenten Endpoint.
 *
 * `expand=content.space` liefert `content.space.key` pro Hit direkt —
 * der Post-Filter kann die Scope-Refs aus der Response lesen, ohne
 * `displayUrl` parsen zu müssen. Fallback-Parsing trotzdem drin für
 * Edge-Cases (z.B. Suchergebnisse ausserhalb von Pages, die
 * `resultGlobalContainer` leer haben).
 */

import { z } from "zod";
import type { ScopeRef } from "@/lib/connectors/filters";
import type { ExecutionContext, ToolResult } from "@/lib/connectors/types";
import type { ConfluenceCloudClient } from "../client";
import { buildSearchCql } from "../cql";
import {
  extractSpaceKeyFromWebui,
  siteWikiPrefix,
  stripHtml,
  uniqueScopeRefs,
  type ConfluenceTool,
} from "./types";

// ---------------------------------------------------------------------------
// args schema
// ---------------------------------------------------------------------------

const searchArgsSchema = z.object({
  query: z.string().trim().min(1).max(500),
  limit: z.number().int().min(1).max(50).default(20),
});

type SearchArgs = z.infer<typeof searchArgsSchema>;

// ---------------------------------------------------------------------------
// v1 CQL search response shape
// ---------------------------------------------------------------------------

interface SearchContentSpace {
  id?: number;
  key?: string;
  name?: string;
}

interface SearchContent {
  id: string;
  type: string;
  title: string;
  space?: SearchContentSpace;
  _links?: {
    webui?: string;
    self?: string;
  };
  history?: {
    lastUpdated?: {
      when?: string;
      friendlyWhen?: string;
    };
  };
}

interface SearchResultItem {
  content?: SearchContent;
  title: string;
  excerpt?: string;
  url?: string;
  score?: number;
  resultGlobalContainer?: {
    title?: string;
    displayUrl?: string;
  };
  lastModified?: string;
}

interface SearchResponse {
  results: SearchResultItem[];
  start: number;
  limit: number;
  size: number;
  totalSize?: number;
  cqlQuery?: string;
}

// ---------------------------------------------------------------------------
// Result-Shape (lokri-intern, nicht 1:1 die Confluence-Response)
// ---------------------------------------------------------------------------

export interface SearchHit {
  pageId: string;
  title: string;
  snippet: string;
  url: string;
  spaceKey: string;
  spaceName: string | null;
  score: number | null;
  lastModified: string | null;
}

export interface SearchToolData {
  hits: SearchHit[];
  total: number;
  cql: string;
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

function contextSpaceKeys(context: ExecutionContext): string[] {
  return context.scopes
    .filter((s) => s.scopeType === "confluence-space")
    .map((s) => s.scopeIdentifier);
}

function deriveSpaceKey(item: SearchResultItem): string | null {
  // 1) Bevorzugt: expand=content.space liefert key direkt
  const expanded = item.content?.space?.key;
  if (expanded) return expanded;
  // 2) Fallback: _links.webui parsen
  const webui = item.content?._links?.webui;
  if (webui) {
    const key = extractSpaceKeyFromWebui(webui);
    if (key) return key;
  }
  // 3) Weiterer Fallback: resultGlobalContainer.displayUrl
  const displayUrl = item.resultGlobalContainer?.displayUrl;
  if (displayUrl) {
    const key = extractSpaceKeyFromWebui(displayUrl);
    if (key) return key;
  }
  return null;
}

export const confluenceSearchTool: ConfluenceTool<SearchArgs> = {
  name: "search",
  argsSchema: searchArgsSchema,

  requiredScopes(_args, context): ScopeRef[] {
    // CQL-Query wird über alle Allowlist-Spaces aufgespannt — jeder
    // davon ist „required" aus Pre-Filter-Sicht (würde einer fehlen,
    // liefe die Query fehlerhaft).
    return context.scopes
      .filter((s) => s.scopeType === "confluence-space")
      .map((s) => ({
        type: "confluence-space",
        identifier: s.scopeIdentifier,
      }));
  },

  extractObservedScopes(result): ScopeRef[] {
    const data = result.data as SearchToolData | null;
    if (!data?.hits) return [];
    return uniqueScopeRefs(
      data.hits.map((h) => ({
        type: "confluence-space",
        identifier: h.spaceKey,
      })),
    );
  },

  async execute(client, args, context): Promise<ToolResult> {
    const spaceKeys = contextSpaceKeys(context);
    if (spaceKeys.length === 0) {
      // Kein Space gescoped → leere Response, kein Upstream-Call.
      return {
        status: "success",
        data: {
          hits: [],
          total: 0,
          cql: "",
        } satisfies SearchToolData,
      };
    }

    const cql = buildSearchCql({ query: args.query, spaceKeys });
    const params = new URLSearchParams({
      cql,
      limit: String(args.limit),
      expand: "content.space,content.history.lastUpdated",
    });

    const response = await client.get<SearchResponse>(
      "/wiki/rest/api/search",
      params,
    );

    const prefix = siteWikiPrefix(context);
    const hits: SearchHit[] = [];
    for (const item of response.results) {
      const spaceKey = deriveSpaceKey(item);
      if (!spaceKey || !item.content) continue;
      const webui = item.content._links?.webui ?? "";
      hits.push({
        pageId: item.content.id,
        title: item.content.title ?? item.title ?? "",
        snippet: stripHtml(item.excerpt ?? ""),
        url: webui ? `${prefix}${webui}` : "",
        spaceKey,
        spaceName: item.content.space?.name ?? item.resultGlobalContainer?.title ?? null,
        score: typeof item.score === "number" ? item.score : null,
        lastModified:
          item.content.history?.lastUpdated?.when ?? item.lastModified ?? null,
      });
    }

    return {
      status: "success",
      data: {
        hits,
        total: response.totalSize ?? response.size ?? hits.length,
        cql,
      } satisfies SearchToolData,
    };
  },
};
