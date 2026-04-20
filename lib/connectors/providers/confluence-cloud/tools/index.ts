/**
 * Tool-Map für Confluence Cloud.
 *
 * Pro Tool-Name → `ConfluenceTool`-Objekt. Wird vom Provider intern
 * für Dispatch benutzt und in Block 3 vom MCP-Tool-Handler importiert,
 * um `requiredScopes` / `extractObservedScopes` für den Gateway-Call
 * zu bekommen.
 *
 * Frozen, weil's eine statische Konfiguration ist — kein Runtime-
 * Mutation.
 */

import { confluenceGetPageChildrenTool } from "./get-page-children";
import { confluenceListRecentTool } from "./list-recent";
import { confluenceReadPageTool } from "./read-page";
import { confluenceSearchTool } from "./search";
import type { ConfluenceTool } from "./types";

export const CONFLUENCE_TOOLS = Object.freeze({
  search: confluenceSearchTool,
  "read-page": confluenceReadPageTool,
  "list-recent": confluenceListRecentTool,
  "get-page-children": confluenceGetPageChildrenTool,
}) satisfies Record<string, ConfluenceTool>;

export type ConfluenceToolName = keyof typeof CONFLUENCE_TOOLS;

export {
  confluenceGetPageChildrenTool,
  confluenceListRecentTool,
  confluenceReadPageTool,
  confluenceSearchTool,
};
export type { ConfluenceTool } from "./types";
export {
  extractSpaceKeyFromWebui,
  resolveSpaceIdToKey,
  siteWikiPrefix,
  stripHtml,
  uniqueScopeRefs,
} from "./types";
export type { SearchHit, SearchToolData } from "./search";
export type { ReadPageData } from "./read-page";
export type { ListRecentData, RecentPage } from "./list-recent";
export type { ChildPage, GetPageChildrenData } from "./get-page-children";
