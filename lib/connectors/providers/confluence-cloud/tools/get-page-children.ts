/**
 * `get-page-children` — Unmittelbare Kinder einer Confluence-Page.
 *
 * Endpoint: v2 `/wiki/api/v2/pages/{id}/children?limit=<N>`
 *
 * Scope-Strategie wie bei `read-page`: wir wissen *vor* dem Fetch
 * nicht, in welcher Space der Parent lebt. Also `requiredScopes = []`
 * und Post-Filter übernimmt. Die Kinder erben die Space des Parents
 * (Confluence-Constraint), d.h. wenn der Parent in einer nicht-gescopten
 * Space ist, sind alle Children ebenfalls dort.
 *
 * `/children` liefert minimale Page-Shapes (kein `_links.webui`, kein
 * Body). Für jedes Child bauen wir die webui-URL selbst aus dem
 * Space-Key (falls resolvbar) + `/pages/{id}`. Space-Key kommt aus
 * `context.scopes` via spaceId-Lookup; wenn nicht in der Allowlist,
 * bleibt URL leer (MCP-Client kann dann den Page-Link nicht
 * konstruieren, aber das ist ok — der Hit wird eh vom Post-Filter
 * geblockt).
 */

import { z } from "zod";
import { ConnectorUpstreamError } from "@/lib/connectors/errors";
import type { ScopeRef } from "@/lib/connectors/filters";
import type { ExecutionContext, ToolResult } from "@/lib/connectors/types";
import type { ConfluenceCloudClient } from "../client";
import {
  resolveSpaceIdToKey,
  siteWikiPrefix,
  uniqueScopeRefs,
  type ConfluenceTool,
} from "./types";

// ---------------------------------------------------------------------------
// args schema
// ---------------------------------------------------------------------------

const getChildrenArgsSchema = z.object({
  pageId: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^\d+$/, "pageId must be a numeric Confluence page ID"),
  limit: z.number().int().min(1).max(50).default(20),
});

type GetChildrenArgs = z.infer<typeof getChildrenArgsSchema>;

// ---------------------------------------------------------------------------
// v2 responses
// ---------------------------------------------------------------------------

interface V2ChildItem {
  id: string;
  status?: string;
  title: string;
  spaceId: string;
  parentId?: string | null;
  childPosition?: number;
}

interface V2ChildrenResponse {
  results: V2ChildItem[];
  _links?: {
    next?: string;
  };
}

// ---------------------------------------------------------------------------
// Result-Shape
// ---------------------------------------------------------------------------

export interface ChildPage {
  pageId: string;
  title: string;
  spaceId: string;
  spaceKey: string | null;
  url: string;
  position: number | null;
}

export interface GetPageChildrenData {
  parentPageId: string;
  /** Space der Parent-Page (alle Children liegen da). Null wenn nicht
   *  in der Allowlist — Post-Filter wird blocken. */
  parentSpaceKey: string | null;
  children: ChildPage[];
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

function buildChildUrl(
  context: ExecutionContext,
  spaceKey: string | null,
  pageId: string,
  title: string,
): string {
  if (!spaceKey) return "";
  const prefix = siteWikiPrefix(context);
  // Confluence-webui-Pattern: `/spaces/{KEY}/pages/{id}/{Title+With+Plus}`
  // Titel mit `+` ist kosmetisch; lokale Links mit nur ID funktionieren
  // ebenfalls, sind aber weniger user-friendly. Wir nehmen die
  // pragmatische Form.
  const slug = encodeURIComponent(title).replace(/%20/g, "+");
  return `${prefix}/spaces/${encodeURIComponent(spaceKey)}/pages/${encodeURIComponent(pageId)}/${slug}`;
}

export const confluenceGetPageChildrenTool: ConfluenceTool<GetChildrenArgs> = {
  name: "get-page-children",
  argsSchema: getChildrenArgsSchema,

  requiredScopes(): ScopeRef[] {
    return [];
  },

  extractObservedScopes(result): ScopeRef[] {
    const data = result.data as GetPageChildrenData | null;
    if (!data) return [];
    // Alle Children erben die Space des Parents. Die Parent-Space
    // ist das einzige relevante Scope-Ref — wir emittieren sie.
    // Falls nicht auflösbar, synthetisch Unknown markieren.
    const refs: ScopeRef[] = [];
    if (data.parentSpaceKey) {
      refs.push({
        type: "confluence-space",
        identifier: data.parentSpaceKey,
      });
    } else {
      // Kein Space-Key auflösbar → aus den Children die spaceIds
      // nehmen und als Unknown-Marker durchreichen. Post-Filter blockt.
      for (const child of data.children) {
        refs.push({
          type: "confluence-space",
          identifier: `__unknown_space_id:${child.spaceId}`,
        });
      }
    }
    return uniqueScopeRefs(refs);
  },

  async execute(client, args, context): Promise<ToolResult> {
    const params = new URLSearchParams({
      limit: String(args.limit),
    });

    let response: V2ChildrenResponse;
    try {
      response = await client.get<V2ChildrenResponse>(
        `/wiki/api/v2/pages/${encodeURIComponent(args.pageId)}/children`,
        params,
      );
    } catch (err) {
      if (err instanceof ConnectorUpstreamError && err.status === 404) {
        return {
          status: "failure",
          data: null,
          reason: `Page ${args.pageId} nicht gefunden oder nicht zugänglich.`,
        };
      }
      throw err;
    }

    // Parent-Space aus dem ersten Child ableiten (alle teilen sie).
    // Wenn leer, keine Kinder, kein Scope-Ref nötig → Post-Filter
    // no-op, status success mit leerer Liste.
    const first = response.results[0];
    const parentSpaceKey = first
      ? resolveSpaceIdToKey(first.spaceId, context)
      : null;

    const children: ChildPage[] = response.results.map((item) => {
      const spaceKey = resolveSpaceIdToKey(item.spaceId, context);
      return {
        pageId: item.id,
        title: item.title,
        spaceId: item.spaceId,
        spaceKey,
        url: buildChildUrl(context, spaceKey, item.id, item.title),
        position: item.childPosition ?? null,
      };
    });

    return {
      status: "success",
      data: {
        parentPageId: args.pageId,
        parentSpaceKey,
        children,
      } satisfies GetPageChildrenData,
    };
  },
};
