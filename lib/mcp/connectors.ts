/**
 * MCP-Tools für konkrete Connector-Integrationen.
 *
 * Aktuell nur Confluence Cloud: `confluence-read-page`,
 * `confluence-list-recent`, `confluence-get-page-children`.
 *
 * Scope-Strategie für Space-Mapping-Tools:
 *   - `requiredScopes = []` (Pre-Filter no-op; Space erst nach Fetch
 *     bekannt bei `read-page` + `get-page-children`)
 *   - `extractObservedScopes`: via `confluence*Tool.extractObservedScopes`
 *   - `scopeIds`: nur die Scopes der Integration, die auf lokri-Spaces
 *     im `spaceScope` des Tokens gemappt sind. Der Gateway filtert
 *     `context.scopes` darauf — so sieht der Provider nur Scopes, die
 *     der User via seinen Space-Zugriff erreichen darf.
 *
 * Integration-Resolution:
 *   - Team hat 0 Confluence-Integrationen → klarer Error mit Hinweis
 *     an den Team-Admin
 *   - Team hat 1 → nimm die, `integration_id` optional
 *   - Team hat >1 → User muss `integration_id` mitgeben; ohne → Fehler
 *     mit Liste der Alternativen
 *   - Integration ist disabled → Fehler „Integration disabled by admin"
 *
 * Alle drei Tools sind statisch registriert. Wenn keine Integration
 * konfiguriert ist, landet der Error im Response-Body (nicht in der
 * Tool-Liste). Das hält die Tool-Registry deterministisch und matched
 * `mcp-handler`'s statische-Liste-Erwartung.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { executeConnectorToolLive } from "@/lib/connectors/gateway-live";
import { listIntegrations } from "@/lib/connectors/integrations";
import { listIntegrationUsages } from "@/lib/connectors/mappings";
import {
  confluenceGetPageChildrenTool,
  confluenceListRecentTool,
  confluenceReadPageTool,
  type GetPageChildrenData,
  type ListRecentData,
  type ReadPageData,
} from "@/lib/connectors/providers/confluence-cloud/tools";
import type { ConnectorIntegration, ToolResult } from "@/lib/connectors/types";

// ---------------------------------------------------------------------------
// Shared tool-response types (aligned with lib/mcp/tools.ts internal shape)
// ---------------------------------------------------------------------------

type McpToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

type ToolExtra = {
  authInfo?: {
    extra?: {
      ownerAccountId?: string;
      userId?: string | null;
      spaceScope?: string[] | null;
    };
  };
};

interface ConnectorAuthCtx {
  ownerAccountId: string;
  userId: string | null;
  spaceScope: string[] | null;
}

function requireConnectorAuth(extra: ToolExtra): ConnectorAuthCtx {
  const id = extra?.authInfo?.extra?.ownerAccountId;
  if (!id || typeof id !== "string") {
    throw new Error(
      "Missing auth context (expected ownerAccountId on authInfo.extra).",
    );
  }
  return {
    ownerAccountId: id,
    userId: extra?.authInfo?.extra?.userId ?? null,
    spaceScope: extra?.authInfo?.extra?.spaceScope ?? null,
  };
}

function ok(data: unknown): McpToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent:
      data && typeof data === "object" && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : { value: data },
  };
}

function toolError(message: string): McpToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

// ---------------------------------------------------------------------------
// Integration-Resolution
// ---------------------------------------------------------------------------

type IntegrationResolution =
  | { kind: "ok"; integration: ConnectorIntegration }
  | { kind: "error"; error: McpToolResult };

async function resolveConfluenceIntegration(
  ownerAccountId: string,
  explicitId?: string,
): Promise<IntegrationResolution> {
  const all = await listIntegrations(ownerAccountId);
  const confluence = all.filter(
    (i) => i.connectorType === "confluence-cloud",
  );

  if (explicitId) {
    const found = confluence.find((i) => i.id === explicitId);
    if (!found) {
      return {
        kind: "error",
        error: toolError(
          `Confluence integration "${explicitId}" not found for this team. ` +
            "List available integrations via the admin UI.",
        ),
      };
    }
    if (!found.enabled) {
      return {
        kind: "error",
        error: toolError(
          `Confluence integration "${found.displayName}" is currently disabled by a team admin.`,
        ),
      };
    }
    return { kind: "ok", integration: found };
  }

  if (confluence.length === 0) {
    return {
      kind: "error",
      error: toolError(
        "No Confluence integration configured for this team. " +
          "A team admin needs to add one in lokri's settings.",
      ),
    };
  }

  const enabled = confluence.filter((i) => i.enabled);
  if (enabled.length === 0) {
    return {
      kind: "error",
      error: toolError(
        "All Confluence integrations for this team are currently disabled.",
      ),
    };
  }

  if (enabled.length > 1) {
    const alts = enabled
      .map((i) => `${i.id} (${i.displayName})`)
      .join(", ");
    return {
      kind: "error",
      error: toolError(
        `Multiple Confluence integrations configured — pass "integration_id" to pick one. Available: ${alts}`,
      ),
    };
  }

  return { kind: "ok", integration: enabled[0] };
}

/**
 * Scope-Subset der Integration, das der User laut `spaceScope` erreichen
 * darf. Landet als `scopeIds` im Gateway-Call.
 *
 * - `spaceScope: null` ⇒ alle gemappten Scopes der Integration
 * - `spaceScope: [A, B]` ⇒ nur Scopes, die auf A oder B gemappt sind
 *
 * Wenn das Ergebnis leer ist, darf der Call laufen, aber der Provider
 * sieht keine Scopes — Tools entscheiden dann typischerweise für
 * leere Hits (search) oder scope-post-block (read-page via unknown-
 * marker).
 *
 * Gibt zusätzlich den "effektiven" lokri-Space-Context zurück, den
 * der Gateway ins Usage-Log schreibt. Wenn `spaceScope` genau einen
 * gemappten Space hat, ist das klar; sonst nehmen wir den ersten
 * gemappten (best-effort für Audit).
 */
async function resolveScopeContext(
  integration: ConnectorIntegration,
  spaceScope: string[] | null,
): Promise<{ scopeIds: string[]; effectiveSpaceId: string | null }> {
  const usages = await listIntegrationUsages(integration.id);
  const allowedSpaces = new Set(spaceScope ?? []);
  const relevant = spaceScope
    ? usages.filter((u) => allowedSpaces.has(u.mapping.spaceId))
    : usages;
  const scopeIds = [...new Set(relevant.map((u) => u.scope.id))];
  const effectiveSpaceId = relevant[0]?.mapping.spaceId ?? null;
  return { scopeIds, effectiveSpaceId };
}

// ---------------------------------------------------------------------------
// registerConnectorTools
// ---------------------------------------------------------------------------

export function registerConnectorTools(server: McpServer): void {
  // ----- confluence-read-page ---------------------------------------------
  server.registerTool(
    "confluence-read-page",
    {
      title: "Read Confluence page",
      description:
        "Fetch a single Confluence page by its numeric ID. Returns rendered " +
        "HTML plus a plain-text extract. Only pages in spaces that have been " +
        "mapped to this team's lokri-spaces are accessible.",
      inputSchema: {
        page_id: z
          .string()
          .regex(/^\d+$/, "Must be a numeric Confluence page ID")
          .describe("Confluence page ID (numeric, from the page URL)"),
        integration_id: z
          .string()
          .uuid()
          .optional()
          .describe(
            "Required only if this team has multiple Confluence integrations.",
          ),
      },
    },
    async ({ page_id, integration_id }, extra) => {
      const auth = requireConnectorAuth(extra as ToolExtra);
      const resolved = await resolveConfluenceIntegration(
        auth.ownerAccountId,
        integration_id,
      );
      if (resolved.kind === "error") return resolved.error;
      const { scopeIds, effectiveSpaceId } = await resolveScopeContext(
        resolved.integration,
        auth.spaceScope,
      );
      const result = await executeConnectorToolLive({
        ownerAccountId: auth.ownerAccountId,
        integrationId: resolved.integration.id,
        toolName: "read-page",
        args: { pageId: page_id },
        callerUserId: auth.userId,
        spaceId: effectiveSpaceId,
        requiredScopes: [],
        scopeIds,
        extractObservedScopes: (r: ToolResult) =>
          confluenceReadPageTool.extractObservedScopes(r),
      });
      return toolResponseOrError(result, (data: ReadPageData) => ({
        id: `confluence:${data.pageId}`,
        title: data.title,
        content: data.bodyText,
        contentHtml: data.bodyHtml,
        url: data.url,
        spaceKey: data.spaceKey,
        version: data.version,
        lastModified: data.lastModified,
        integrationId: resolved.integration.id,
      }));
    },
  );

  // ----- confluence-list-recent -------------------------------------------
  server.registerTool(
    "confluence-list-recent",
    {
      title: "List recent Confluence pages",
      description:
        "Recently-modified pages from the mapped Confluence spaces. " +
        "Sorted newest first.",
      inputSchema: {
        limit: z
          .number()
          .int()
          .positive()
          .max(50)
          .optional()
          .describe("Default 20."),
        space_keys: z
          .array(z.string().min(1))
          .optional()
          .describe(
            "Optional subset of allowed Confluence space keys. Must all be " +
              "in this team's allowlist.",
          ),
        integration_id: z.string().uuid().optional(),
      },
    },
    async ({ limit, space_keys, integration_id }, extra) => {
      const auth = requireConnectorAuth(extra as ToolExtra);
      const resolved = await resolveConfluenceIntegration(
        auth.ownerAccountId,
        integration_id,
      );
      if (resolved.kind === "error") return resolved.error;
      const { scopeIds, effectiveSpaceId } = await resolveScopeContext(
        resolved.integration,
        auth.spaceScope,
      );
      const effectiveLimit = limit ?? 20;
      const args: { limit: number; spaceKeys?: string[] } = {
        limit: effectiveLimit,
      };
      if (space_keys && space_keys.length > 0) args.spaceKeys = space_keys;

      const result = await executeConnectorToolLive({
        ownerAccountId: auth.ownerAccountId,
        integrationId: resolved.integration.id,
        toolName: "list-recent",
        args,
        callerUserId: auth.userId,
        spaceId: effectiveSpaceId,
        requiredScopes: space_keys
          ? space_keys.map((k) => ({
              type: "confluence-space",
              identifier: k,
            }))
          : [],
        scopeIds,
        extractObservedScopes: (r: ToolResult) =>
          confluenceListRecentTool.extractObservedScopes(r),
      });
      return toolResponseOrError(result, (data: ListRecentData) => ({
        pages: data.pages.map((p) => ({
          id: `confluence:${p.pageId}`,
          title: p.title,
          spaceKey: p.spaceKey,
          url: p.url,
          version: p.version,
          lastModified: p.lastModified,
        })),
        skippedSpaceKeys: data.skippedSpaceKeys,
        integrationId: resolved.integration.id,
      }));
    },
  );

  // ----- confluence-get-page-children -------------------------------------
  server.registerTool(
    "confluence-get-page-children",
    {
      title: "Get Confluence page children",
      description:
        "Immediate children of a Confluence page. Useful for navigating " +
        "a space's page tree one level at a time.",
      inputSchema: {
        page_id: z
          .string()
          .regex(/^\d+$/, "Must be a numeric Confluence page ID"),
        limit: z.number().int().positive().max(50).optional(),
        integration_id: z.string().uuid().optional(),
      },
    },
    async ({ page_id, limit, integration_id }, extra) => {
      const auth = requireConnectorAuth(extra as ToolExtra);
      const resolved = await resolveConfluenceIntegration(
        auth.ownerAccountId,
        integration_id,
      );
      if (resolved.kind === "error") return resolved.error;
      const { scopeIds, effectiveSpaceId } = await resolveScopeContext(
        resolved.integration,
        auth.spaceScope,
      );
      const result = await executeConnectorToolLive({
        ownerAccountId: auth.ownerAccountId,
        integrationId: resolved.integration.id,
        toolName: "get-page-children",
        args: { pageId: page_id, limit: limit ?? 20 },
        callerUserId: auth.userId,
        spaceId: effectiveSpaceId,
        requiredScopes: [],
        scopeIds,
        extractObservedScopes: (r: ToolResult) =>
          confluenceGetPageChildrenTool.extractObservedScopes(r),
      });
      return toolResponseOrError(result, (data: GetPageChildrenData) => ({
        parentPageId: `confluence:${data.parentPageId}`,
        parentSpaceKey: data.parentSpaceKey,
        children: data.children.map((c) => ({
          id: `confluence:${c.pageId}`,
          title: c.title,
          spaceKey: c.spaceKey,
          url: c.url,
          position: c.position,
        })),
        integrationId: resolved.integration.id,
      }));
    },
  );
}

// ---------------------------------------------------------------------------
// Helper: ToolResult → MCP-response, mit Mapper-Funktion für success-Payload
// ---------------------------------------------------------------------------

function toolResponseOrError<T>(
  result: ToolResult,
  mapSuccess: (data: T) => unknown,
): McpToolResult {
  if (result.status === "success") {
    return ok(mapSuccess(result.data as T));
  }
  if (result.status === "degraded") {
    return toolError(
      `Confluence call degraded: ${result.reason ?? "unknown reason"}`,
    );
  }
  // failure
  return toolError(
    `Confluence call failed: ${result.reason ?? "unknown reason"}`,
  );
}
