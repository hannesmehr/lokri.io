/**
 * Statische `ConnectorDefinition` für Confluence Cloud.
 *
 * Wird vom Provider als `definition` exportiert und landet — einmal
 * via `registerConnectorProvider` — in der globalen Registry. MVP-Tools
 * sind die vier aus `docs/CONNECTOR_FRAMEWORK.md` §MVP-Scope.
 */

import type { ConnectorDefinition } from "@/lib/connectors/types";

export const CONFLUENCE_CLOUD_TOOLS = [
  "search",
  "read-page",
  "list-recent",
  "get-page-children",
] as const;

export type ConfluenceCloudToolName = (typeof CONFLUENCE_CLOUD_TOOLS)[number];

export const confluenceCloudDefinition: ConnectorDefinition = {
  id: "confluence-cloud",
  name: "Confluence Cloud",
  description:
    "Confluence Cloud (Atlassian). Suche, Pages lesen, Struktur navigieren.",
  // Icon-String wird in Block 3 (UI) zu einer konkreten Asset-Referenz
  // aufgelöst (lucide-Icon, SVG-Import, …). Bis dahin String-Slug.
  icon: "confluence",
  category: "knowledge",
  authType: "pat",
  scopeModel: {
    type: "confluence-space",
    label: "Confluence-Spaces",
    identifierLabel: "Space-Key",
  },
  tools: CONFLUENCE_CLOUD_TOOLS,
};
