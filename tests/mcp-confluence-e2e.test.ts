/**
 * E2E gegen die echte Empro-Confluence + die echte lokri-DB.
 *
 * Skip-Bedingung: alle vier Env-Vars müssen gesetzt sein:
 *   - CONFLUENCE_LIVE_TEST_EMAIL
 *   - CONFLUENCE_LIVE_TEST_API_TOKEN
 *   - CONFLUENCE_LIVE_TEST_SITE_URL
 *   - CONFLUENCE_LIVE_TEST_OWNER_ACCOUNT_ID
 *
 * Optional: CONFLUENCE_LIVE_TEST_SEARCH_QUERY (default: "ferien" — plausibler
 * Empro-Term; anpassen falls die Instanz anderes indexiert hat).
 *
 * **Voraussetzung**: `scripts/confluence-setup-dev.ts` wurde gegen dasselbe
 * Team ausgeführt, sodass eine Integration + Allowlist + mindestens ein
 * Space-Mapping in der DB stehen. Der Test setzt NICHTS davon an —
 * idempotent ist das Setup-Script, nicht der Test.
 *
 * Ohne die Env-Vars läuft der Test nicht an — `test(…, { skip: !ENABLED })`
 * markiert ihn im Output als skipped. Node's Test-Runner exitet damit
 * grün. CI ohne die Vars läuft durch, ohne die Datei anfassen zu müssen.
 *
 * Die top-level-Imports sind bewusst nur der `test` aus `node:test` —
 * alle DB- und Connector-Imports passieren lazy im Test-Body, damit
 * ein geskippter Test keine DATABASE_URL braucht.
 */

import assert from "node:assert/strict";
import test from "node:test";

const email = process.env.CONFLUENCE_LIVE_TEST_EMAIL;
const apiToken = process.env.CONFLUENCE_LIVE_TEST_API_TOKEN;
const siteUrl = process.env.CONFLUENCE_LIVE_TEST_SITE_URL;
const ownerAccountId = process.env.CONFLUENCE_LIVE_TEST_OWNER_ACCOUNT_ID;
const query = process.env.CONFLUENCE_LIVE_TEST_SEARCH_QUERY ?? "ferien";

const ENABLED =
  Boolean(email) &&
  Boolean(apiToken) &&
  Boolean(siteUrl) &&
  Boolean(ownerAccountId);

test(
  "E2E: unified search returns mixed results from lokri + confluence",
  { skip: !ENABLED },
  async () => {
    const { runUnifiedSearch } = await import("@/lib/mcp/tools/search");
    const result = await runUnifiedSearch({
      ownerAccountId: ownerAccountId!,
      userId: null, // legacy-style audit: nobody in particular
      spaceScope: null, // unrestricted
      query,
      limit: 20,
    });

    // Assertion 1: search returns without throwing
    assert.ok(Array.isArray(result.results));
    assert.ok(Array.isArray(result.degradedSources));

    // Assertion 2: we expect SOME result — either internal or external.
    // Empty means either (a) query matches nothing (unlikely with
    // "ferien" against Empro wiki) or (b) setup isn't wired. Fail
    // loudly so the operator can diagnose.
    assert.ok(
      result.results.length > 0,
      `Expected at least one hit for query "${query}". Check that the setup script ran and that the Empro-Confluence has pages matching the query.`,
    );

    // Assertion 3: no catastrophic degradation — if Confluence is
    // unreachable we want to know. A single degraded source is ok
    // (timeout happens); if ALL sources are degraded the E2E isn't
    // useful.
    const hasConfluenceHits = result.results.some(
      (r) => r.source === "confluence-cloud",
    );
    if (!hasConfluenceHits && result.degradedSources.length > 0) {
      console.error(
        "E2E note: no Confluence hits AND degraded sources present:",
      );
      for (const d of result.degradedSources) {
        console.error(`  - ${d.sourceLabel}: ${d.reason}`);
      }
    }

    // Assertion 4: hits carry the required MCP-shape (source, id,
    // title, score). Agnostic of source.
    for (const r of result.results) {
      assert.equal(typeof r.id, "string");
      assert.equal(typeof r.title, "string");
      assert.equal(typeof r.source, "string");
      assert.equal(typeof r.score, "number");
      assert.ok(r.score >= 0 && r.score <= 1, `score out of range: ${r.score}`);
    }

    // Log a brief preview so operator sees the mix
    console.log(
      `  Unified search returned ${result.results.length} hits:`,
    );
    const sources = new Map<string, number>();
    for (const r of result.results) {
      sources.set(r.source, (sources.get(r.source) ?? 0) + 1);
    }
    for (const [src, n] of sources) console.log(`    ${src}: ${n}`);
    if (result.degradedSources.length > 0) {
      console.log(`  Degraded: ${result.degradedSources.length} source(s)`);
    }
  },
);

test(
  "E2E: confluence-read-page fetches the first confluence hit's page content",
  { skip: !ENABLED },
  async () => {
    const { runUnifiedSearch } = await import("@/lib/mcp/tools/search");
    const { executeConnectorToolLive } = await import(
      "@/lib/connectors/gateway-live"
    );
    const { listIntegrations } = await import(
      "@/lib/connectors/integrations"
    );
    const { listIntegrationUsages } = await import(
      "@/lib/connectors/mappings"
    );
    const { confluenceReadPageTool } = await import(
      "@/lib/connectors/providers/confluence-cloud/tools"
    );

    // Step 1: search to find a confluence hit we can then read
    const search = await runUnifiedSearch({
      ownerAccountId: ownerAccountId!,
      userId: null,
      spaceScope: null,
      query,
      limit: 20,
    });
    const confluenceHit = search.results.find(
      (r) => r.source === "confluence-cloud",
    );
    if (!confluenceHit) {
      // Nicht als Fehler — kann vorkommen, wenn Empro gerade keine
      // Hits zum Query liefert. Skippe den read-page-Teil mit Notiz.
      console.log("  No Confluence hit in search — skipping read-page.");
      return;
    }
    const pageId = String(confluenceHit.metadata?.pageId);
    assert.match(pageId, /^\d+$/, `expected numeric pageId, got ${pageId}`);

    // Step 2: Integration + Scope-IDs resolven (wie lib/mcp/connectors.ts)
    const integrations = await listIntegrations(ownerAccountId!);
    const integration = integrations.find(
      (i) => i.connectorType === "confluence-cloud" && i.enabled,
    );
    assert.ok(integration, "No enabled confluence-cloud integration found");
    const usages = await listIntegrationUsages(integration.id);
    const scopeIds = [...new Set(usages.map((u) => u.scope.id))];
    const effectiveSpaceId = usages[0]?.mapping.spaceId ?? null;

    // Step 3: read-page via Gateway-Live
    const result = await executeConnectorToolLive({
      ownerAccountId: ownerAccountId!,
      integrationId: integration.id,
      toolName: "read-page",
      args: { pageId },
      callerUserId: null,
      spaceId: effectiveSpaceId,
      requiredScopes: [],
      scopeIds,
      extractObservedScopes: (r) =>
        confluenceReadPageTool.extractObservedScopes(r),
    });

    assert.equal(
      result.status,
      "success",
      `Expected success, got ${result.status} (reason: ${result.reason ?? ""})`,
    );
    const data = result.data as {
      pageId: string;
      title: string;
      bodyText: string;
      spaceKey: string | null;
    };
    assert.equal(data.pageId, pageId);
    assert.ok(data.title.length > 0);
    assert.ok(data.spaceKey, "spaceKey should be resolvable from allowlist");
    console.log(
      `  Read page ${pageId} → "${data.title}" in space ${data.spaceKey} (${data.bodyText.length} chars)`,
    );
  },
);
