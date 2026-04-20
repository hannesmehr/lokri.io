/**
 * Tool-Tests für Confluence: search, read-page, list-recent,
 * get-page-children. Pro Tool:
 *   - argsSchema-Validation
 *   - execute mit gemocktem HTTP-Client → Response-Mapping
 *   - requiredScopes / extractObservedScopes liefert erwartete Werte
 *
 * Ein gemeinsamer Fixture-Loader hält die Tests knapp.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { ConnectorUpstreamError } from "@/lib/connectors/errors";
import type { ConnectorIntegration, ConnectorScope, ExecutionContext, ToolResult } from "@/lib/connectors/types";
import { ConfluenceCloudClient } from "@/lib/connectors/providers/confluence-cloud/client";
import {
  CONFLUENCE_TOOLS,
  confluenceGetPageChildrenTool,
  confluenceListRecentTool,
  confluenceReadPageTool,
  confluenceSearchTool,
  type GetPageChildrenData,
  type ListRecentData,
  type ReadPageData,
  type SearchToolData,
} from "@/lib/connectors/providers/confluence-cloud/tools";

const FIXTURES = resolve(
  process.cwd(),
  "lib/connectors/providers/confluence-cloud/__fixtures__",
);

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(FIXTURES, name), "utf8"));
}

const SEARCH_RESPONSE = loadFixture("search-response.json");
const PAGE_RESPONSE = loadFixture("page-response.json");
const LIST_RECENT_RESPONSE = loadFixture("list-recent-response.json");
const CHILDREN_RESPONSE = loadFixture("children-response.json");

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

const NOW = new Date("2026-04-20T00:00:00.000Z");

function fakeIntegration(): ConnectorIntegration {
  return {
    id: "int_1",
    ownerAccountId: "acct_1",
    connectorType: "confluence-cloud",
    displayName: "Empro Confluence",
    authType: "pat",
    credentialsEncrypted: "v1:unused-in-these-tests",
    config: { siteUrl: "https://empro.atlassian.net" },
    enabled: true,
    lastTestedAt: NOW,
    lastError: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function fakeScope(key: string, spaceId: string): ConnectorScope {
  return {
    id: `scope_${key}`,
    connectorIntegrationId: "int_1",
    scopeType: "confluence-space",
    scopeIdentifier: key,
    scopeMetadata: { spaceId, displayName: key },
    createdAt: NOW,
  };
}

function fakeContext(
  scopes: ConnectorScope[] = [
    fakeScope("ENG", "98304"),
    fakeScope("PROD", "131072"),
  ],
): ExecutionContext {
  return {
    integration: fakeIntegration(),
    scopes,
    callerUserId: "user_1",
    spaceId: "lokri-space-1",
  };
}

function captureClient(handler: (url: string) => Response) {
  const urls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    urls.push(url);
    return handler(url);
  };
  const client = new ConfluenceCloudClient(
    { email: "jane@empro.ch", apiToken: "ATATT3xFfGF0T0k3n1234567890" },
    { siteUrl: "https://empro.atlassian.net" },
    { fetchImpl },
  );
  return { client, urls };
}

// ===========================================================================
// Tools-Map / Integrity
// ===========================================================================

test("CONFLUENCE_TOOLS exposes all four MVP tools", () => {
  assert.deepEqual(Object.keys(CONFLUENCE_TOOLS).sort(), [
    "get-page-children",
    "list-recent",
    "read-page",
    "search",
  ]);
});

test("each tool's name matches its map key", () => {
  for (const [key, tool] of Object.entries(CONFLUENCE_TOOLS)) {
    assert.equal(tool.name, key, `tool under ${key} must be named ${key}`);
  }
});

// ===========================================================================
// search
// ===========================================================================

test("search: args schema rejects empty query", () => {
  assert.throws(() => confluenceSearchTool.argsSchema.parse({ query: "" }));
});

test("search: args schema applies default limit=20", () => {
  const parsed = confluenceSearchTool.argsSchema.parse({ query: "x" });
  assert.equal(parsed.limit, 20);
});

test("search: args schema caps limit at 50", () => {
  assert.throws(() =>
    confluenceSearchTool.argsSchema.parse({ query: "x", limit: 51 }),
  );
});

test("search: execute maps v1 response to hits with absolute URLs", async () => {
  const { client, urls } = captureClient(
    () => new Response(JSON.stringify(SEARCH_RESPONSE), { status: 200 }),
  );
  const result = await confluenceSearchTool.execute(
    client,
    { query: "lokri", limit: 20 },
    fakeContext(),
  );
  assert.equal(result.status, "success");
  const data = result.data as SearchToolData;
  assert.equal(data.hits.length, 2);
  assert.equal(data.hits[0].pageId, "6750201");
  assert.equal(data.hits[0].spaceKey, "ENG");
  assert.equal(data.hits[0].spaceName, "Engineering");
  assert.equal(
    data.hits[0].url,
    "https://empro.atlassian.net/wiki/spaces/ENG/pages/6750201/Onboarding+Checklist",
  );
  assert.equal(data.hits[0].score, 42.5);
  // HTML-Strip: <strong>lokri</strong> → "lokri"; &nbsp; normalised
  assert.ok(!data.hits[0].snippet.includes("<"));
  assert.ok(data.hits[0].snippet.toLowerCase().includes("lokri"));
  // URL war `/wiki/rest/api/search?cql=...&limit=20&expand=...`
  assert.match(urls[0], /\/wiki\/rest\/api\/search/);
  assert.match(urls[0], /expand=content\.space%2Ccontent\.history\.lastUpdated/);
});

test("search: builds CQL with all scoped space keys", async () => {
  const { client, urls } = captureClient(
    () =>
      new Response(
        JSON.stringify({ results: [], start: 0, limit: 20, size: 0, totalSize: 0 }),
        { status: 200 },
      ),
  );
  await confluenceSearchTool.execute(
    client,
    { query: "test", limit: 20 },
    fakeContext([fakeScope("ENG", "1"), fakeScope("KnowHow", "2")]),
  );
  // URLSearchParams encodiert Leerzeichen als `+` — korrekt via
  // parse-und-extract auflösen, nicht mit decodeURIComponent
  // (das lässt `+` stehen).
  const parsed = new URL(urls[0]);
  const cql = parsed.searchParams.get("cql") ?? "";
  assert.match(cql, /space IN \("ENG", "KnowHow"\)/);
  assert.match(cql, /text ~ "test"/);
});

test("search: empty scope list → success with empty hits, no upstream call", async () => {
  let called = false;
  const { client } = captureClient(() => {
    called = true;
    return new Response("{}", { status: 200 });
  });
  const result = await confluenceSearchTool.execute(
    client,
    { query: "x", limit: 20 },
    fakeContext([]),
  );
  assert.equal(called, false);
  assert.equal(result.status, "success");
  assert.deepEqual((result.data as SearchToolData).hits, []);
});

test("search: extractObservedScopes dedupes and returns confluence-space type", () => {
  const sample: ToolResult = {
    status: "success",
    data: {
      hits: [
        { spaceKey: "ENG" },
        { spaceKey: "PROD" },
        { spaceKey: "ENG" },
      ],
    } as unknown as SearchToolData,
  };
  const observed = confluenceSearchTool.extractObservedScopes(sample);
  assert.equal(observed.length, 2);
  assert.deepEqual(
    observed.map((s) => s.identifier).sort(),
    ["ENG", "PROD"],
  );
  assert.ok(observed.every((s) => s.type === "confluence-space"));
});

test("search: requiredScopes returns all context scopes", () => {
  const ctx = fakeContext([
    fakeScope("ENG", "1"),
    fakeScope("KnowHow", "2"),
  ]);
  const required = confluenceSearchTool.requiredScopes(
    { query: "x", limit: 20 },
    ctx,
  );
  assert.deepEqual(
    required.map((s) => s.identifier).sort(),
    ["ENG", "KnowHow"],
  );
});

// ===========================================================================
// read-page
// ===========================================================================

test("read-page: args schema enforces numeric pageId", () => {
  assert.throws(() =>
    confluenceReadPageTool.argsSchema.parse({ pageId: "not-numeric" }),
  );
});

test("read-page: execute returns bodyHtml + bodyText + resolved spaceKey", async () => {
  const { client, urls } = captureClient(
    () => new Response(JSON.stringify(PAGE_RESPONSE), { status: 200 }),
  );
  const ctx = fakeContext();
  const result = await confluenceReadPageTool.execute(
    client,
    { pageId: "6750201" },
    ctx,
  );
  assert.equal(result.status, "success");
  const data = result.data as ReadPageData;
  assert.equal(data.pageId, "6750201");
  assert.equal(data.title, "Onboarding Checklist");
  assert.equal(data.spaceId, "98304");
  assert.equal(data.spaceKey, "ENG"); // aus scopes.metadata.spaceId resolved
  assert.ok(data.bodyHtml.includes("<h1>"));
  assert.ok(data.bodyText.startsWith("Welcome to lokri"));
  assert.equal(data.version, 5);
  assert.match(urls[0], /\/wiki\/api\/v2\/pages\/6750201/);
  assert.match(urls[0], /body-format=view/);
});

test("read-page: spaceKey is null when spaceId not in allowlist", async () => {
  const { client } = captureClient(
    () => new Response(JSON.stringify(PAGE_RESPONSE), { status: 200 }),
  );
  // Kein Scope mit spaceId 98304 → spaceKey soll null sein
  const result = await confluenceReadPageTool.execute(
    client,
    { pageId: "6750201" },
    fakeContext([fakeScope("HR", "999999")]),
  );
  const data = result.data as ReadPageData;
  assert.equal(data.spaceKey, null);
});

test("read-page: 404 → failure ToolResult with German reason", async () => {
  const { client } = captureClient(
    () => new Response("", { status: 404 }),
  );
  const result = await confluenceReadPageTool.execute(
    client,
    { pageId: "999999" },
    fakeContext(),
  );
  assert.equal(result.status, "failure");
  assert.match(result.reason ?? "", /nicht gefunden|nicht zug/i);
});

test("read-page: non-404 upstream error propagates", async () => {
  const { client } = captureClient(
    () => new Response("", { status: 500 }),
  );
  await assert.rejects(
    () =>
      confluenceReadPageTool.execute(
        client,
        { pageId: "6750201" },
        fakeContext(),
      ),
    (err) => err instanceof ConnectorUpstreamError && err.status === 500,
  );
});

test("read-page: requiredScopes returns empty (post-filter does the work)", () => {
  const required = confluenceReadPageTool.requiredScopes(
    { pageId: "1" },
    fakeContext(),
  );
  assert.deepEqual(required, []);
});

test("read-page: observedScopes emits unknown marker when space not in allowlist", () => {
  const sample: ToolResult = {
    status: "success",
    data: {
      pageId: "1",
      spaceId: "999999",
      spaceKey: null,
    } as unknown as ReadPageData,
  };
  const observed = confluenceReadPageTool.extractObservedScopes(sample);
  assert.equal(observed.length, 1);
  assert.equal(observed[0].type, "confluence-space");
  assert.match(observed[0].identifier, /^__unknown_space_id:999999$/);
});

// ===========================================================================
// list-recent
// ===========================================================================

test("list-recent: execute sends comma-joined space-id param and maps response", async () => {
  const { client, urls } = captureClient(
    () => new Response(JSON.stringify(LIST_RECENT_RESPONSE), { status: 200 }),
  );
  const result = await confluenceListRecentTool.execute(
    client,
    { limit: 20 },
    fakeContext(),
  );
  assert.equal(result.status, "success");
  const data = result.data as ListRecentData;
  assert.equal(data.pages.length, 2);
  assert.equal(data.pages[0].spaceKey, "PROD");
  assert.equal(data.pages[0].pageId, "6750310");
  assert.match(urls[0], /space-id=98304%2C131072/);
  assert.match(urls[0], /sort=-modified-date/);
});

test("list-recent: skipped spaceKeys when metadata.spaceId missing", async () => {
  const { client } = captureClient(
    () =>
      new Response(
        JSON.stringify({ results: [], _links: {} }),
        { status: 200 },
      ),
  );
  const legacyScope: ConnectorScope = {
    id: "scope_LEG",
    connectorIntegrationId: "int_1",
    scopeType: "confluence-space",
    scopeIdentifier: "LEG",
    scopeMetadata: { displayName: "Legacy" }, // no spaceId!
    createdAt: NOW,
  };
  const result = await confluenceListRecentTool.execute(
    client,
    { limit: 20 },
    fakeContext([legacyScope]),
  );
  const data = result.data as ListRecentData;
  assert.deepEqual(data.skippedSpaceKeys, ["LEG"]);
  assert.equal(data.pages.length, 0);
});

test("list-recent: subset via args.spaceKeys narrows required + request", async () => {
  const { client, urls } = captureClient(
    () =>
      new Response(
        JSON.stringify({ results: [], _links: {} }),
        { status: 200 },
      ),
  );
  await confluenceListRecentTool.execute(
    client,
    { limit: 20, spaceKeys: ["ENG"] },
    fakeContext(),
  );
  assert.match(urls[0], /space-id=98304(?!%2C)/); // ENG only
});

test("list-recent: requiredScopes matches args.spaceKeys when given", () => {
  const required = confluenceListRecentTool.requiredScopes(
    { limit: 20, spaceKeys: ["KnowHow"] },
    fakeContext(),
  );
  assert.deepEqual(required, [
    { type: "confluence-space", identifier: "KnowHow" },
  ]);
});

test("list-recent: requiredScopes defaults to all scopes when args.spaceKeys undefined", () => {
  const required = confluenceListRecentTool.requiredScopes(
    { limit: 20 },
    fakeContext(),
  );
  assert.equal(required.length, 2);
});

// ===========================================================================
// get-page-children
// ===========================================================================

test("get-page-children: execute maps children with resolved spaceKey", async () => {
  const { client, urls } = captureClient(
    () => new Response(JSON.stringify(CHILDREN_RESPONSE), { status: 200 }),
  );
  const result = await confluenceGetPageChildrenTool.execute(
    client,
    { pageId: "6750310", limit: 20 },
    fakeContext(),
  );
  assert.equal(result.status, "success");
  const data = result.data as GetPageChildrenData;
  assert.equal(data.parentPageId, "6750310");
  assert.equal(data.parentSpaceKey, "PROD");
  assert.equal(data.children.length, 2);
  assert.equal(data.children[0].spaceKey, "PROD");
  assert.match(
    data.children[0].url,
    /https:\/\/empro\.atlassian\.net\/wiki\/spaces\/PROD\/pages\/6750311/,
  );
  assert.match(urls[0], /\/wiki\/api\/v2\/pages\/6750310\/children/);
});

test("get-page-children: 404 → failure ToolResult", async () => {
  const { client } = captureClient(() => new Response("", { status: 404 }));
  const result = await confluenceGetPageChildrenTool.execute(
    client,
    { pageId: "999999", limit: 20 },
    fakeContext(),
  );
  assert.equal(result.status, "failure");
});

test("get-page-children: observedScopes emits unknown marker when parent space not in allowlist", () => {
  const sample: ToolResult = {
    status: "success",
    data: {
      parentPageId: "1",
      parentSpaceKey: null,
      children: [
        { pageId: "2", title: "c", spaceId: "999", spaceKey: null, url: "", position: 0 },
      ],
    } as unknown as GetPageChildrenData,
  };
  const observed = confluenceGetPageChildrenTool.extractObservedScopes(sample);
  assert.equal(observed.length, 1);
  assert.match(observed[0].identifier, /^__unknown_space_id:999$/);
});

test("get-page-children: requiredScopes returns empty (post-filter enforcement)", () => {
  const required = confluenceGetPageChildrenTool.requiredScopes(
    { pageId: "1", limit: 20 },
    fakeContext(),
  );
  assert.deepEqual(required, []);
});
