/**
 * `externalSearch`-Tests — via DI-Override `options.execute`.
 *
 * Der Gateway-Call wird durch eine Mock-Funktion ersetzt; kein DB-
 * Touch, keine echte Filter-Pipeline. Fokus liegt auf:
 *   - Input-Shape an den Gateway (scopeIds, requiredScopes,
 *     extractObservedScopes korrekt gesetzt)
 *   - Mapping von Confluence-ToolResult auf ExternalSearchHit
 *   - Degradation-Pfad (Gateway liefert degraded)
 *   - Timeout-Pfad (withTimeout greift)
 *   - Unsupported Connector-Typ
 */

import assert from "node:assert/strict";
import test from "node:test";
import type { ExecuteConnectorToolInput } from "@/lib/connectors/gateway";
import { externalSearch } from "@/lib/mcp/tools/search/external";
import type { ExternalSource } from "@/lib/mcp/tools/search/external";
import type {
  ConnectorIntegration,
  ConnectorScope,
  SpaceExternalSource,
  ToolResult,
} from "@/lib/connectors/types";

const NOW = new Date("2026-04-20T00:00:00.000Z");

function fakeIntegration(
  overrides: Partial<ConnectorIntegration> = {},
): ConnectorIntegration {
  return {
    id: "int_1",
    ownerAccountId: "acct_1",
    connectorType: "confluence-cloud",
    displayName: "Empro Confluence",
    authType: "pat",
    credentialsEncrypted: "v1:unused",
    config: { siteUrl: "https://empro.atlassian.net" },
    enabled: true,
    lastTestedAt: NOW,
    lastError: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function fakeScope(key: string, id = "scope_1"): ConnectorScope {
  return {
    id,
    connectorIntegrationId: "int_1",
    scopeType: "confluence-space",
    scopeIdentifier: key,
    scopeMetadata: { spaceId: "98304" },
    createdAt: NOW,
  };
}

function fakeMapping(): SpaceExternalSource {
  return {
    id: "m1",
    spaceId: "lokri-space-1",
    connectorScopeId: "scope_1",
    addedByUserId: "user_1",
    createdAt: NOW,
  };
}

function source(
  overrides: Partial<ExternalSource> = {},
): ExternalSource {
  return {
    mapping: fakeMapping(),
    scope: fakeScope("ENG"),
    integration: fakeIntegration(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Happy path + Input-Shape-Assertion
// ---------------------------------------------------------------------------

test("externalSearch: builds gateway input with correct scopeIds + requiredScopes + callerUserId", async () => {
  let capturedInput: ExecuteConnectorToolInput | null = null;
  const outcome = await externalSearch(
    source(),
    "ferien",
    15,
    { ownerAccountId: "acct_1", userId: "user_42" },
    {
      execute: async (input) => {
        capturedInput = input;
        return {
          status: "success",
          data: { hits: [], total: 0, cql: "" },
        };
      },
    },
  );
  assert.equal(outcome.status, "ok");
  if (!capturedInput) throw new Error("execute was not called");
  const input: ExecuteConnectorToolInput = capturedInput;
  assert.equal(input.toolName, "search");
  assert.equal(input.callerUserId, "user_42");
  assert.equal(input.spaceId, "lokri-space-1");
  assert.equal(input.integrationId, "int_1");
  assert.deepEqual(input.scopeIds, ["scope_1"]);
  assert.deepEqual(input.requiredScopes, [
    { type: "confluence-space", identifier: "ENG" },
  ]);
  assert.equal(typeof input.extractObservedScopes, "function");
});

test("externalSearch: callerUserId null is passed through (legacy token)", async () => {
  let capturedInput: ExecuteConnectorToolInput | null = null;
  await externalSearch(
    source(),
    "x",
    10,
    { ownerAccountId: "acct_1", userId: null },
    {
      execute: async (input) => {
        capturedInput = input;
        return { status: "success", data: { hits: [], total: 0, cql: "" } };
      },
    },
  );
  if (!capturedInput) throw new Error("execute was not called");
  const input: ExecuteConnectorToolInput = capturedInput;
  assert.equal(input.callerUserId, null);
});

test("externalSearch: maps confluence hits to ExternalSearchHit with prefix and metadata", async () => {
  const outcome = await externalSearch(
    source(),
    "deploy",
    20,
    { ownerAccountId: "acct_1", userId: "user_1" },
    {
      execute: async () => ({
        status: "success",
        data: {
          hits: [
            {
              pageId: "6750310",
              title: "lokri Deployment Notes",
              snippet: "deploy playbook",
              url: "https://empro.atlassian.net/wiki/spaces/ENG/pages/6750310/lokri+Deployment+Notes",
              spaceKey: "ENG",
              spaceName: "Engineering",
              score: 31.1,
              lastModified: "2026-04-18T09:15:00.000Z",
            },
          ],
          total: 1,
          cql: "...",
        },
      }),
    },
  );
  assert.equal(outcome.status, "ok");
  if (outcome.status !== "ok") return;
  assert.equal(outcome.hits.length, 1);
  const h = outcome.hits[0];
  assert.equal(h.id, "confluence:6750310");
  assert.equal(h.source, "confluence-cloud");
  assert.equal(h.sourceLabel, "Empro Confluence");
  assert.equal(h.rawScore, 31.1);
  assert.equal(h.lokriSpaceId, "lokri-space-1");
  assert.equal(h.metadata.pageId, "6750310");
  assert.equal(h.metadata.spaceKey, "ENG");
  assert.equal(h.metadata.integrationId, "int_1");
});

// ---------------------------------------------------------------------------
// Error paths
// ---------------------------------------------------------------------------

test("externalSearch: degraded ToolResult → degraded outcome with reason", async () => {
  const outcome = await externalSearch(
    source(),
    "x",
    10,
    { ownerAccountId: "acct_1", userId: "user_1" },
    {
      execute: async () => ({
        status: "degraded",
        data: null,
        reason: "Upstream 503",
      }),
    },
  );
  assert.equal(outcome.status, "degraded");
  if (outcome.status === "degraded") {
    assert.match(outcome.reason, /503/);
    assert.equal(outcome.sourceLabel, "Empro Confluence");
    assert.deepEqual(outcome.hits, []);
  }
});

test("externalSearch: failure ToolResult → failure outcome", async () => {
  const outcome = await externalSearch(
    source(),
    "x",
    10,
    { ownerAccountId: "acct_1", userId: "user_1" },
    {
      execute: async () => ({
        status: "failure",
        data: null,
        reason: "Scope rejected",
      }),
    },
  );
  assert.equal(outcome.status, "failure");
  if (outcome.status === "failure") {
    assert.match(outcome.reason, /Scope/);
  }
});

test("externalSearch: thrown error from execute becomes failure outcome (no rethrow)", async () => {
  const outcome = await externalSearch(
    source(),
    "x",
    10,
    { ownerAccountId: "acct_1", userId: "user_1" },
    {
      execute: async () => {
        throw new Error("unexpected kaboom");
      },
    },
  );
  assert.equal(outcome.status, "failure");
  if (outcome.status === "failure") {
    assert.match(outcome.reason, /kaboom/);
  }
});

// ---------------------------------------------------------------------------
// Timeout
// ---------------------------------------------------------------------------

test("externalSearch: timeout wins over slow execute → degraded with 'Timeout after …ms'", async () => {
  const outcome = await externalSearch(
    source(),
    "x",
    10,
    { ownerAccountId: "acct_1", userId: "user_1" },
    {
      timeoutMs: 20,
      execute: () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                status: "success",
                data: { hits: [], total: 0, cql: "" },
              }),
            200, // viel länger als Timeout
          ),
        ),
    },
  );
  assert.equal(outcome.status, "degraded");
  if (outcome.status === "degraded") {
    assert.match(outcome.reason, /Timeout after 20ms/);
  }
});

// ---------------------------------------------------------------------------
// Unsupported connector type
// ---------------------------------------------------------------------------

test("externalSearch: unsupported connector type → failure without upstream call", async () => {
  let executeCalled = false;
  const outcome = await externalSearch(
    source({ integration: fakeIntegration({ connectorType: "slack" }) }),
    "x",
    10,
    { ownerAccountId: "acct_1", userId: "user_1" },
    {
      execute: async () => {
        executeCalled = true;
        return { status: "success", data: null };
      },
    },
  );
  assert.equal(executeCalled, false);
  assert.equal(outcome.status, "failure");
  if (outcome.status === "failure") {
    assert.match(outcome.reason, /Unsupported connector type.*slack/);
  }
});
