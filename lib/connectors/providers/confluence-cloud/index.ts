/**
 * Confluence-Cloud-Provider — Public-Exports.
 *
 * Call-Sites importieren aus hier, nicht aus den Sub-Dateien. Das hält
 * uns die Freiheit, intern umzubauen (z.B. `tools/` in Block 2 als
 * eigene Dateien anlegen).
 */

export {
  CONFLUENCE_CLOUD_TOOLS,
  confluenceCloudDefinition,
  type ConfluenceCloudToolName,
} from "./definition";
export {
  confluenceCloudCredentialsSchema,
  type ConfluenceCloudCredentials,
} from "./credentials";
export {
  buildConfluenceUrl,
  confluenceCloudConfigSchema,
  type ConfluenceCloudConfig,
} from "./config";
export {
  ConfluenceCloudClient,
  type ConfluenceCloudClientOptions,
} from "./client";
export {
  ConfluenceCloudProvider,
  type ConfluenceCloudProviderOptions,
} from "./provider";
export {
  CONFLUENCE_TOOLS,
  type ConfluenceTool,
  type ConfluenceToolName,
  confluenceGetPageChildrenTool,
  confluenceListRecentTool,
  confluenceReadPageTool,
  confluenceSearchTool,
} from "./tools";
export type {
  ChildPage,
  GetPageChildrenData,
  ListRecentData,
  ReadPageData,
  RecentPage,
  SearchHit,
  SearchToolData,
} from "./tools";
export {
  buildSearchCql,
  CqlBuilderError,
  escapeCqlIdentifier,
  escapeCqlString,
} from "./cql";
