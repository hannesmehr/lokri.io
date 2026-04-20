/**
 * Integration-Test: Gateway + ConfluenceCloudProvider.
 *
 * Kein DB-Zugriff — der Gateway wird mit Mock-Ops gefüttert und der
 * Provider mit Mock-fetch. Die Filter-Pipeline läuft real
 * (scope-enforcement, scope-post).
 *
 * Abgedeckte Szenarien:
 *   - Happy-Path: search liefert Hits, Usage-Log geschrieben, keine
 *     Leaks
 *   - Scope-Post-Leak: Provider gibt Hit mit ungescopter Space zurück
 *     → scopePostFilter wirft → Usage-Log `failure` mit
 *     [scope-post-leak]-Marker
 *   - Auth-Error: Upstream 401 → Gateway setzt integration.last_error
 */

import assert from "node:assert/strict";
import test from "node:test";
import { __resetForTests, register } from "@/lib/connectors/registry";
import {
  executeConnectorTool,
  type GatewayOps,
} from "@/lib/connectors/gateway";
import { encryptConnectorCredentials } from "@/lib/connectors/encryption";
import { ConfluenceCloudProvider } from "@/lib/connectors/providers/confluence-cloud/provider";
import {
  confluenceSearchTool,
  type SearchToolData,
} from "@/lib/connectors/providers/confluence-cloud/tools";
import type {
  ConnectorIntegration,
  ConnectorScope,
  ToolResult,
} from "@/lib/connectors/types";
import type { RecordUsageInput } from "@/lib/connectors/usage-log";

// STORAGE_CONFIG_KEY wird für encryptConnectorCredentials gebraucht.
process.env.STORAGE_CONFIG_KEY =
  process.env.STORAGE_CONFIG_KEY ?? "confluence-gateway-test-secret";

const NOW = new Date("2026-04-20T00:00:00.000Z");

function buildIntegration(): ConnectorIntegration {
  return {
    id: "int_1",
    ownerAccountId: "acct_1",
    connectorType: "confluence-cloud",
    displayName: "Empro Confluence",
    authType: "pat",
    credentialsEncrypted: encryptConnectorCredentials({
      email: "jane@empro.ch",
      apiToken: "ATATT3xFfGF0T0k3n1234567890",
    }),
    config: { siteUrl: "https://empro.atlassian.net" },
    enabled: true,
    lastTestedAt: NOW,
    lastError: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function buildScope(key: string, spaceId: string): ConnectorScope {
  return {
    id: `scope_${key}`,
    connectorIntegrationId: "int_1",
    scopeType: "confluence-space",
    scopeIdentifier: key,
    scopeMetadata: { spaceId, displayName: key },
    createdAt: NOW,
  };
}

interface MockOpsResult {
  ops: GatewayOps;
  usageCalls: RecordUsageInput[];
  errorCalls: Array<[string, string]>;
}

function buildOps(opts: {
  integration: ConnectorIntegration;
  scopes: ConnectorScope[];
  provider: ConfluenceCloudProvider;
}): MockOpsResult {
  const usageCalls: RecordUsageInput[] = [];
  const errorCalls: Array<[string, string]> = [];
  const ops: GatewayOps = {
    async loadIntegration() {
      return opts.integration;
    },
    async loadScopes() {
      return opts.scopes;
    },
    async recordUsage(input) {
      usageCalls.push(input);
    },
    async recordIntegrationError(id, msg) {
      errorCalls.push([id, msg]);
    },
    getProvider() {
      return opts.provider;
    },
  };
  return { ops, usageCalls, errorCalls };
}

// Helper: Capture die vom Confluence-Search-Tool erwartete Response
// und liefere sie aus einem gemockten fetch.
function providerWithFetch(
  handler: (url: string) => Response,
): ConfluenceCloudProvider {
  return new ConfluenceCloudProvider({
    fetchImpl: async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      return handler(url);
    },
  });
}

// ===========================================================================

test("gateway+confluence: search happy-path → success + usage-log written", async () => {
  __resetForTests();

  const provider = providerWithFetch((url) => {
    assert.match(url, /\/wiki\/rest\/api\/search/);
    return new Response(
      JSON.stringify({
        results: [
          {
            content: {
              id: "1",
              type: "page",
              title: "lokri notes",
              space: { key: "ENG", name: "Engineering" },
              _links: { webui: "/spaces/ENG/pages/1/lokri+notes" },
              history: { lastUpdated: { when: "2026-04-10T10:00:00.000Z" } },
            },
            title: "lokri notes",
            excerpt: "<p>notes</p>",
            score: 10,
          },
        ],
        start: 0,
        limit: 20,
        size: 1,
        totalSize: 1,
      }),
      { status: 200 },
    );
  });

  const integration = buildIntegration();
  const scopes = [buildScope("ENG", "98304")];
  const { ops, usageCalls, errorCalls } = buildOps({
    integration,
    scopes,
    provider,
  });

  const result = await executeConnectorTool(
    {
      ownerAccountId: integration.ownerAccountId,
      integrationId: integration.id,
      toolName: "search",
      args: { query: "lokri", limit: 20 },
      callerUserId: "user_1",
      spaceId: "lokri-space-1",
      requiredScopes: confluenceSearchTool.requiredScopes(
        { query: "lokri", limit: 20 },
        { integration, scopes, callerUserId: "user_1", spaceId: "lokri-space-1" },
      ),
      extractObservedScopes: (r: ToolResult) =>
        confluenceSearchTool.extractObservedScopes(r),
    },
    ops,
  );

  assert.equal(result.status, "success");
  const data = result.data as SearchToolData;
  assert.equal(data.hits.length, 1);
  assert.equal(data.hits[0].spaceKey, "ENG");

  // Usage-Log geschrieben mit status=success
  assert.equal(usageCalls.length, 1);
  assert.equal(usageCalls[0].status, "success");
  assert.equal(usageCalls[0].action, "search");
  // Integration-Error NICHT gesetzt
  assert.equal(errorCalls.length, 0);
});

test("gateway+confluence: scope-post leak is blocked by scopePostFilter", async () => {
  __resetForTests();

  // Provider liefert einen Hit aus einer ungescopten Space (SECRET) —
  // realistische Simulation eines Upstream-Bugs oder Token-Überpermission.
  const provider = providerWithFetch(
    () =>
      new Response(
        JSON.stringify({
          results: [
            {
              content: {
                id: "999",
                type: "page",
                title: "leaked",
                space: { key: "SECRET", name: "Secret" },
                _links: { webui: "/spaces/SECRET/pages/999/leaked" },
              },
              title: "leaked",
              excerpt: "",
              score: 1,
            },
          ],
          start: 0,
          limit: 20,
          size: 1,
          totalSize: 1,
        }),
        { status: 200 },
      ),
  );

  const integration = buildIntegration();
  // Allowlist: NUR ENG — SECRET ist nicht gescoped
  const scopes = [buildScope("ENG", "98304")];
  const { ops, usageCalls, errorCalls } = buildOps({
    integration,
    scopes,
    provider,
  });

  const result = await executeConnectorTool(
    {
      ownerAccountId: integration.ownerAccountId,
      integrationId: integration.id,
      toolName: "search",
      args: { query: "anything", limit: 20 },
      callerUserId: "user_1",
      spaceId: "lokri-space-1",
      requiredScopes: confluenceSearchTool.requiredScopes(
        { query: "anything", limit: 20 },
        { integration, scopes, callerUserId: "user_1", spaceId: "lokri-space-1" },
      ),
      extractObservedScopes: (r: ToolResult) =>
        confluenceSearchTool.extractObservedScopes(r),
    },
    ops,
  );

  // Gateway klassifiziert Post-Leak als failure
  assert.equal(result.status, "failure");
  assert.match(result.reason ?? "", /scope-post/i);

  // Usage-Log prominent markiert
  assert.equal(usageCalls.length, 1);
  assert.equal(usageCalls[0].status, "failure");
  const respMeta = usageCalls[0].responseMetadata as { error: string };
  assert.match(respMeta.error, /\[scope-post-leak\]/);

  // Scope-Post-Leak ist KEIN Auth-Problem → last_error bleibt unverändert
  assert.equal(errorCalls.length, 0);
});

test("gateway+confluence: 401 → failure + integration.last_error persisted", async () => {
  __resetForTests();

  const provider = providerWithFetch(
    () => new Response("Unauthorized", { status: 401 }),
  );

  const integration = buildIntegration();
  const scopes = [buildScope("ENG", "98304")];
  const { ops, usageCalls, errorCalls } = buildOps({
    integration,
    scopes,
    provider,
  });

  const result = await executeConnectorTool(
    {
      ownerAccountId: integration.ownerAccountId,
      integrationId: integration.id,
      toolName: "search",
      args: { query: "lokri", limit: 20 },
      callerUserId: "user_1",
      spaceId: "lokri-space-1",
      requiredScopes: [{ type: "confluence-space", identifier: "ENG" }],
      extractObservedScopes: (r: ToolResult) =>
        confluenceSearchTool.extractObservedScopes(r),
    },
    ops,
  );

  assert.equal(result.status, "failure");
  assert.equal(usageCalls[0].status, "failure");
  // Auth-Pfad → integration.last_error SET
  assert.equal(errorCalls.length, 1);
  assert.equal(errorCalls[0][0], integration.id);
  assert.match(errorCalls[0][1], /rejected/);
});

test("gateway+confluence: provider is registry-compatible (smoke)", () => {
  __resetForTests();
  const provider = new ConfluenceCloudProvider();
  register(provider);
  // Wenn register durchläuft, ist der Provider contract-kompatibel.
  assert.equal(provider.definition.id, "confluence-cloud");
});
