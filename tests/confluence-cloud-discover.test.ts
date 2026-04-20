/**
 * `discoverScopes` — Pagination, Scope-Shape, Sanity-Cap.
 *
 * Nutzt v2 `/wiki/api/v2/spaces?type=global` mit Cursor-Pagination
 * via `_links.next` (relative Pfade).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  ConnectorAuthError,
  ConnectorUpstreamError,
} from "@/lib/connectors/errors";
import { ConfluenceCloudProvider } from "@/lib/connectors/providers/confluence-cloud/provider";

const FIXTURES = resolve(
  process.cwd(),
  "lib/connectors/providers/confluence-cloud/__fixtures__",
);

const PAGE1 = JSON.parse(
  readFileSync(resolve(FIXTURES, "spaces-v2-page1.json"), "utf8"),
);
const PAGE2 = JSON.parse(
  readFileSync(resolve(FIXTURES, "spaces-v2-page2.json"), "utf8"),
);
const EMPTY = JSON.parse(
  readFileSync(resolve(FIXTURES, "spaces-v2-empty.json"), "utf8"),
);

const CREDS = {
  email: "jane@empro.ch",
  apiToken: "ATATT3xFfGF0T0k3n1234567890",
};
const CONFIG = { siteUrl: "https://empro.atlassian.net" };

function providerWithRoutes(
  routes: Array<(url: string) => Response | null | undefined>,
): { provider: ConfluenceCloudProvider; urls: string[] } {
  const urls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    urls.push(url);
    for (const route of routes) {
      const r = route(url);
      if (r) return r;
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  return { provider: new ConfluenceCloudProvider({ fetchImpl }), urls };
}

// ---------------------------------------------------------------------------
// Single-page
// ---------------------------------------------------------------------------

test("discoverScopes: no next link → single fetch, full list returned", async () => {
  const { provider, urls } = providerWithRoutes([
    (url) =>
      /\/wiki\/api\/v2\/spaces\?type=global&limit=250$/.test(url)
        ? new Response(JSON.stringify(EMPTY), { status: 200 })
        : null,
  ]);
  const scopes = await provider.discoverScopes(CREDS, CONFIG);
  assert.equal(scopes.length, 0);
  assert.equal(urls.length, 1);
});

test("discoverScopes: maps v2 space to DiscoveredScope shape", async () => {
  const { provider } = providerWithRoutes([
    (url) =>
      url.includes("/wiki/api/v2/spaces?type=global")
        ? new Response(JSON.stringify({ results: PAGE1.results, _links: {} }), {
            status: 200,
          })
        : null,
  ]);
  const scopes = await provider.discoverScopes(CREDS, CONFIG);
  assert.equal(scopes.length, 3);
  assert.deepEqual(scopes[0], {
    type: "confluence-space",
    identifier: "ENG",
    metadata: {
      displayName: "Engineering",
      spaceId: "98304",
      confluenceType: "global",
      status: "current",
    },
  });
  // Identifier ist der Space-KEY, nicht die numerische ID — wichtig
  // fürs CQL-Search-Tool in Block 2.
  assert.equal(scopes[0].identifier, "ENG");
  // Die numerische ID ist als metadata.spaceId verfügbar für die v2-
  // Tools (list-recent, get-page-children).
  assert.equal(scopes[0].metadata?.spaceId, "98304");
});

// ---------------------------------------------------------------------------
// Multi-page via `_links.next`
// ---------------------------------------------------------------------------

test("discoverScopes: follows _links.next until exhausted", async () => {
  const { provider, urls } = providerWithRoutes([
    (url) =>
      /\/wiki\/api\/v2\/spaces\?type=global&limit=250$/.test(url)
        ? new Response(JSON.stringify(PAGE1), { status: 200 })
        : null,
    (url) =>
      /cursor=/.test(url)
        ? new Response(JSON.stringify(PAGE2), { status: 200 })
        : null,
  ]);
  const scopes = await provider.discoverScopes(CREDS, CONFIG);
  assert.equal(scopes.length, 5);
  assert.equal(urls.length, 2);
  assert.deepEqual(
    scopes.map((s) => s.identifier),
    ["ENG", "PROD", "DOC", "OPS", "HR"],
  );
});

test("discoverScopes: resolves relative _links.next against siteUrl", async () => {
  const { provider, urls } = providerWithRoutes([
    (url) =>
      /type=global&limit=250$/.test(url)
        ? new Response(JSON.stringify(PAGE1), { status: 200 })
        : null,
    (url) =>
      /cursor=/.test(url)
        ? new Response(JSON.stringify(PAGE2), { status: 200 })
        : null,
  ]);
  await provider.discoverScopes(CREDS, CONFIG);
  // Beide URLs müssen absolute https://empro.atlassian.net/… sein.
  for (const url of urls) {
    assert.match(url, /^https:\/\/empro\.atlassian\.net\//);
  }
});

// ---------------------------------------------------------------------------
// Sanity-Cap
// ---------------------------------------------------------------------------

test("discoverScopes: stops at 1000-entry cap even if next-link continues", async () => {
  // Endlose Pagination simulieren: jede Seite liefert 250 Entries und
  // einen next-Link.
  const pageFactory = (pageNum: number) => ({
    results: Array.from({ length: 250 }, (_, i) => ({
      id: String(pageNum * 1000 + i),
      key: `SPC${pageNum}_${i}`,
      name: `Space ${pageNum}-${i}`,
      type: "global",
      status: "current",
    })),
    _links: { next: `/wiki/api/v2/spaces?cursor=page${pageNum + 1}&type=global&limit=250` },
  });
  let callCount = 0;
  const { provider } = providerWithRoutes([
    () => {
      callCount++;
      return new Response(JSON.stringify(pageFactory(callCount)), {
        status: 200,
      });
    },
  ]);
  const scopes = await provider.discoverScopes(CREDS, CONFIG);
  // Cap bei 1000
  assert.equal(scopes.length, 1000);
  // Loop stoppt nach max 4 Pages à 250
  assert.ok(callCount <= 4, `expected ≤4 upstream calls, got ${callCount}`);
});

// ---------------------------------------------------------------------------
// Error paths — propagieren (nicht in TestResult verpackt)
// ---------------------------------------------------------------------------

test("discoverScopes: 401 propagates as ConnectorAuthError", async () => {
  const { provider } = providerWithRoutes([
    () => new Response("Unauthorized", { status: 401 }),
  ]);
  await assert.rejects(
    () => provider.discoverScopes(CREDS, CONFIG),
    (err) => err instanceof ConnectorAuthError,
  );
});

test("discoverScopes: 503 propagates as ConnectorUpstreamError", async () => {
  const { provider } = providerWithRoutes([
    () => new Response("", { status: 503 }),
  ]);
  await assert.rejects(
    () => provider.discoverScopes(CREDS, CONFIG),
    (err) => err instanceof ConnectorUpstreamError && err.status === 503,
  );
});

test("discoverScopes: invalid credentials throws ZodError", async () => {
  const provider = new ConfluenceCloudProvider();
  await assert.rejects(() =>
    provider.discoverScopes({ email: "bad", apiToken: "short" }, CONFIG),
  );
});
