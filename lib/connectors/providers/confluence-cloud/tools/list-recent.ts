/**
 * `list-recent` — Kürzlich geänderte Pages aus den gescopten Spaces.
 *
 * Endpoint: v2 `/wiki/api/v2/pages?space-id=<IDs>&sort=-modified-date&limit=<N>`
 *
 * `space-id` ist numerisch und nimmt Komma-separierte Listen. Wir
 * ziehen die IDs aus `scopeMetadata.spaceId` (vom Discovery-Flow
 * gesetzt). Falls eine Scope aus irgendeinem Grund keine gespeicherte
 * spaceId hat (Legacy-Row? Inkonsistenz?) — dann wird diese Space in
 * der Anfrage übersprungen, und das Usage-Log dokumentiert's über
 * `response.data.skippedSpaces`.
 *
 * `sort=-modified-date` sortiert absteigend (neueste zuerst). Das
 * Minus-Prefix ist v2-Convention.
 *
 * Args:
 *   - `limit`: 1..50, Default 20
 *   - `spaceKeys?`: optionales Subset der Allowlist, z.B. „zeig nur
 *     Engineering-Pages". Wenn angegeben, muss jeder Key in der
 *     Allowlist sein — sonst Pre-Filter-Reject.
 */

import { z } from "zod";
import type { ScopeRef } from "@/lib/connectors/filters";
import type { ExecutionContext, ToolResult } from "@/lib/connectors/types";
import type { ConfluenceCloudClient } from "../client";
import {
  extractSpaceKeyFromWebui,
  resolveSpaceIdToKey,
  siteWikiPrefix,
  uniqueScopeRefs,
  type ConfluenceTool,
} from "./types";

// ---------------------------------------------------------------------------
// args schema
// ---------------------------------------------------------------------------

const listRecentArgsSchema = z.object({
  limit: z.number().int().min(1).max(50).default(20),
  /** Optional: auf ein Subset der Allowlist-Spaces einschränken.
   *  Wenn undefined → alle gescopten Spaces. */
  spaceKeys: z.array(z.string().min(1)).optional(),
});

type ListRecentArgs = z.infer<typeof listRecentArgsSchema>;

// ---------------------------------------------------------------------------
// v2 pages response shape (Teilmenge)
// ---------------------------------------------------------------------------

interface V2PageListItem {
  id: string;
  status: string;
  title: string;
  spaceId: string;
  parentId?: string | null;
  createdAt?: string;
  version?: {
    number?: number;
    createdAt?: string;
  };
  _links?: {
    webui?: string;
  };
}

interface V2PageListResponse {
  results: V2PageListItem[];
  _links?: {
    next?: string;
  };
}

// ---------------------------------------------------------------------------
// Result-Shape
// ---------------------------------------------------------------------------

export interface RecentPage {
  pageId: string;
  title: string;
  spaceId: string;
  spaceKey: string | null;
  url: string;
  version: number | null;
  lastModified: string | null;
  parentId: string | null;
}

export interface ListRecentData {
  pages: RecentPage[];
  /** Space-Keys aus der Allowlist, die keine numerische ID haben —
   *  übersprungen. UI kann das anzeigen, z.B. „Scope neu discovern". */
  skippedSpaceKeys: string[];
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

function effectiveScopes(
  args: ListRecentArgs,
  context: ExecutionContext,
) {
  const allowedByType = context.scopes.filter(
    (s) => s.scopeType === "confluence-space",
  );
  if (!args.spaceKeys || args.spaceKeys.length === 0) return allowedByType;
  const wanted = new Set(args.spaceKeys);
  return allowedByType.filter((s) => wanted.has(s.scopeIdentifier));
}

export const confluenceListRecentTool: ConfluenceTool<ListRecentArgs> = {
  name: "list-recent",
  argsSchema: listRecentArgsSchema,

  requiredScopes(args, context): ScopeRef[] {
    // Wenn User explizit ein Subset angefragt hat, required = nur dieses
    // Subset. Der Pre-Filter prüft dann: muss alles in der Allowlist
    // sein.
    if (args.spaceKeys && args.spaceKeys.length > 0) {
      return args.spaceKeys.map((identifier) => ({
        type: "confluence-space",
        identifier,
      }));
    }
    // Sonst: alle gescopten Spaces
    return context.scopes
      .filter((s) => s.scopeType === "confluence-space")
      .map((s) => ({
        type: "confluence-space",
        identifier: s.scopeIdentifier,
      }));
  },

  extractObservedScopes(result): ScopeRef[] {
    const data = result.data as ListRecentData | null;
    if (!data?.pages) return [];
    return uniqueScopeRefs(
      data.pages.map((p) => ({
        type: "confluence-space",
        // `spaceKey` ist null, wenn der Page-spaceId nicht in der
        // Allowlist war — als Identifier bleibt eine synthetische
        // Unknown-Markierung, damit Post-Filter blockt.
        identifier:
          p.spaceKey ?? `__unknown_space_id:${p.spaceId}`,
      })),
    );
  },

  async execute(client, args, context): Promise<ToolResult> {
    const scopes = effectiveScopes(args, context);
    const spaceIds: string[] = [];
    const skippedSpaceKeys: string[] = [];
    for (const scope of scopes) {
      const stored = (scope.scopeMetadata as { spaceId?: string } | null)
        ?.spaceId;
      if (stored) {
        spaceIds.push(stored);
      } else {
        skippedSpaceKeys.push(scope.scopeIdentifier);
      }
    }

    if (spaceIds.length === 0) {
      return {
        status: "success",
        data: {
          pages: [],
          skippedSpaceKeys,
        } satisfies ListRecentData,
      };
    }

    const params = new URLSearchParams({
      "space-id": spaceIds.join(","),
      sort: "-modified-date",
      limit: String(args.limit),
    });

    const response = await client.get<V2PageListResponse>(
      "/wiki/api/v2/pages",
      params,
    );

    const prefix = siteWikiPrefix(context);
    const pages: RecentPage[] = response.results.map((item) => {
      const webui = item._links?.webui ?? "";
      return {
        pageId: item.id,
        title: item.title,
        spaceId: item.spaceId,
        spaceKey:
          resolveSpaceIdToKey(item.spaceId, context) ??
          (webui ? extractSpaceKeyFromWebui(webui) : null),
        url: webui ? `${prefix}${webui}` : "",
        version: item.version?.number ?? null,
        lastModified: item.version?.createdAt ?? item.createdAt ?? null,
        parentId: item.parentId ?? null,
      };
    });

    return {
      status: "success",
      data: {
        pages,
        skippedSpaceKeys,
      } satisfies ListRecentData,
    };
  },
};
