/**
 * Gateway-Tests.
 *
 * Alles über DI — `executeConnectorTool(input, ops)` bekommt Mock-
 * Implementierungen für die DB-Calls. Die globale Registry wird via
 * `ops.getProvider`-Override umgangen; so brauchen wir keine
 * `__resetForTests()`-Aufrufe zwischen den Cases.
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  ConnectorAuthError,
  ConnectorConfigError,
  ConnectorScopeError,
  ConnectorScopePostError,
  ConnectorUpstreamError,
} from "@/lib/connectors/errors";
import {
  executeConnectorTool,
  type ExecuteConnectorToolInput,
  type GatewayOps,
} from "@/lib/connectors/gateway";
import type { ConnectorProvider } from "@/lib/connectors/provider";
import type {
  ConnectorDefinition,
  ConnectorIntegration,
  ConnectorScope,
  ToolResult,
} from "@/lib/connectors/types";
import type {
  RecordUsageInput,
  UsageLogStatus,
} from "@/lib/connectors/usage-log";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date("2026-04-20T10:00:00.000Z");

function fakeIntegration(
  overrides: Partial<ConnectorIntegration> = {},
): ConnectorIntegration {
  return {
    id: "int_1",
    ownerAccountId: "acct_1",
    connectorType: "confluence-cloud",
    displayName: "Empro Confluence",
    authType: "pat",
    credentialsEncrypted: "v1:fake",
    config: { siteUrl: "https://empro.atlassian.net" },
    enabled: true,
    lastTestedAt: NOW,
    lastError: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function fakeScope(identifier: string): ConnectorScope {
  return {
    id: `scope_${identifier}`,
    connectorIntegrationId: "int_1",
    scopeType: "confluence-space",
    scopeIdentifier: identifier,
    scopeMetadata: null,
    createdAt: NOW,
  };
}

interface MockProviderConfig {
  onExecute?: (toolName: string, args: unknown) => ToolResult | Promise<ToolResult>;
}

function makeProvider(config: MockProviderConfig = {}): ConnectorProvider {
  const definition: ConnectorDefinition = {
    id: "confluence-cloud",
    name: "Confluence Cloud",
    description: "Confluence Cloud Connector",
    icon: "confluence",
    category: "knowledge",
    authType: "pat",
    scopeModel: {
      type: "confluence-space",
      label: "Confluence-Spaces",
      identifierLabel: "Space-Key",
    },
    tools: ["search", "read-page"],
  };
  return {
    definition,
    async testCredentials() {
      return { ok: true, message: "fake" };
    },
    async discoverScopes() {
      return [];
    },
    async executeTool(toolName, args) {
      if (config.onExecute) return config.onExecute(toolName, args);
      return { status: "success", data: { hits: [] } };
    },
  };
}

interface MockOpsConfig {
  integration?: ConnectorIntegration | null;
  scopes?: ConnectorScope[];
  provider?: ConnectorProvider;
  /** Simulate recordUsage failure. */
  recordUsageThrows?: Error;
  /** Simulate recordIntegrationError failure. */
  recordIntegrationErrorThrows?: Error;
}

interface MockOpsResult {
  ops: GatewayOps;
  calls: {
    loadIntegration: Array<[string, string]>;
    loadScopes: string[];
    recordUsage: RecordUsageInput[];
    recordIntegrationError: Array<[string, string]>;
  };
}

function makeOps(config: MockOpsConfig = {}): MockOpsResult {
  const calls: MockOpsResult["calls"] = {
    loadIntegration: [],
    loadScopes: [],
    recordUsage: [],
    recordIntegrationError: [],
  };
  const ops: GatewayOps = {
    async loadIntegration(id, acct) {
      calls.loadIntegration.push([id, acct]);
      return config.integration === undefined
        ? fakeIntegration()
        : config.integration;
    },
    async loadScopes(id) {
      calls.loadScopes.push(id);
      return config.scopes ?? [fakeScope("ENG")];
    },
    async recordUsage(input) {
      calls.recordUsage.push(input);
      if (config.recordUsageThrows) throw config.recordUsageThrows;
    },
    async recordIntegrationError(id, msg) {
      calls.recordIntegrationError.push([id, msg]);
      if (config.recordIntegrationErrorThrows)
        throw config.recordIntegrationErrorThrows;
    },
    getProvider() {
      return config.provider ?? makeProvider();
    },
  };
  return { ops, calls };
}

function baseInput(
  overrides: Partial<ExecuteConnectorToolInput> = {},
): ExecuteConnectorToolInput {
  return {
    ownerAccountId: "acct_1",
    integrationId: "int_1",
    toolName: "search",
    args: { query: "lokri" },
    callerUserId: "user_1",
    spaceId: "space_1",
    requiredScopes: [{ type: "confluence-space", identifier: "ENG" }],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

test("success: returns provider result + logs status=success", async () => {
  const provider = makeProvider({
    onExecute: async () => ({
      status: "success",
      data: { hits: [{ id: 1 }] },
    }),
  });
  const { ops, calls } = makeOps({ provider });

  const result = await executeConnectorTool(baseInput(), ops);

  assert.equal(result.status, "success");
  assert.deepEqual(result.data, { hits: [{ id: 1 }] });
  assert.equal(calls.recordUsage.length, 1);
  assert.equal(calls.recordUsage[0].status, "success");
  assert.equal(calls.recordUsage[0].action, "search");
  assert.equal(calls.recordUsage[0].connectorIntegrationId, "int_1");
  assert.equal(calls.recordUsage[0].userId, "user_1");
  assert.equal(calls.recordUsage[0].spaceId, "space_1");
  assert.equal(typeof calls.recordUsage[0].durationMs, "number");
});

test("request_metadata carries sanitized args (secrets stripped)", async () => {
  const { ops, calls } = makeOps();
  await executeConnectorTool(
    baseInput({
      args: { query: "x", pat: "ATATT3x", extra: { secret: "nope" } },
    }),
    ops,
  );
  const metadata = calls.recordUsage[0].requestMetadata as Record<string, unknown>;
  const args = metadata.args as Record<string, unknown>;
  assert.equal(args.query, "x");
  assert.equal(args.pat, "[REDACTED]");
  assert.deepEqual(args.extra, { secret: "[REDACTED]" });
  assert.equal(metadata.connectorType, "confluence-cloud");
});

test("degraded result from provider is logged as degraded", async () => {
  const provider = makeProvider({
    onExecute: async () => ({
      status: "degraded",
      data: { hits: [] },
      reason: "partial hits",
    }),
  });
  const { ops, calls } = makeOps({ provider });
  const result = await executeConnectorTool(baseInput(), ops);
  assert.equal(result.status, "degraded");
  assert.equal(calls.recordUsage[0].status, "degraded");
  assert.deepEqual(calls.recordUsage[0].responseMetadata, {
    error: "partial hits",
  });
});

// ---------------------------------------------------------------------------
// Config-Fehler
// ---------------------------------------------------------------------------

test("integration not found → ConnectorConfigError, NO usage-log", async () => {
  const { ops, calls } = makeOps({ integration: null });
  await assert.rejects(
    () => executeConnectorTool(baseInput(), ops),
    (err) =>
      err instanceof ConnectorConfigError &&
      /int_1/.test(err.message) &&
      /acct_1/.test(err.message),
  );
  assert.equal(calls.recordUsage.length, 0);
});

test("disabled integration → failure + logged with integration-disabled marker", async () => {
  const { ops, calls } = makeOps({
    integration: fakeIntegration({ enabled: false }),
  });
  const result = await executeConnectorTool(baseInput(), ops);
  assert.equal(result.status, "failure");
  assert.match(result.reason ?? "", /disabled/i);
  assert.equal(calls.recordUsage.length, 1);
  assert.equal(calls.recordUsage[0].status, "failure");
  assert.deepEqual(calls.recordUsage[0].responseMetadata, {
    error: "integration-disabled",
  });
});

// ---------------------------------------------------------------------------
// Error-Klassifikation
// ---------------------------------------------------------------------------

test("ConnectorScopeError (pre-filter) → failure, NO integration.last_error", async () => {
  // requiredScopes asks for SECRET, allowlist only has ENG
  const { ops, calls } = makeOps({ scopes: [fakeScope("ENG")] });
  const result = await executeConnectorTool(
    baseInput({
      requiredScopes: [{ type: "confluence-space", identifier: "SECRET" }],
    }),
    ops,
  );
  assert.equal(result.status, "failure");
  assert.match(result.reason ?? "", /SECRET/);
  assert.equal(calls.recordUsage[0].status, "failure");
  assert.equal(calls.recordIntegrationError.length, 0);
});

test("ConnectorAuthError → failure + integration.last_error persisted", async () => {
  const provider = makeProvider({
    onExecute: async () => {
      throw new ConnectorAuthError("PAT rejected by Confluence");
    },
  });
  const { ops, calls } = makeOps({ provider });
  const result = await executeConnectorTool(baseInput(), ops);
  assert.equal(result.status, "failure");
  assert.match(result.reason ?? "", /PAT rejected/);
  assert.equal(calls.recordUsage[0].status, "failure");
  assert.equal(calls.recordIntegrationError.length, 1);
  assert.equal(calls.recordIntegrationError[0][0], "int_1");
  assert.match(calls.recordIntegrationError[0][1], /PAT rejected/);
});

test("ConnectorUpstreamError → degraded", async () => {
  const provider = makeProvider({
    onExecute: async () => {
      throw new ConnectorUpstreamError("Upstream 503", { status: 503 });
    },
  });
  const { ops, calls } = makeOps({ provider });
  const result = await executeConnectorTool(baseInput(), ops);
  assert.equal(result.status, "degraded");
  assert.equal(calls.recordUsage[0].status, "degraded");
  assert.equal(calls.recordIntegrationError.length, 0);
});

test("ConnectorScopePostError → failure, log message tagged [scope-post-leak]", async () => {
  const provider = makeProvider({
    onExecute: async () => ({
      status: "success",
      data: { hits: [{ spaceKey: "LEAKED" }] },
    }),
  });
  const { ops, calls } = makeOps({ provider });
  const result = await executeConnectorTool(
    baseInput({
      requiredScopes: [{ type: "confluence-space", identifier: "ENG" }],
      extractObservedScopes: () => [
        { type: "confluence-space", identifier: "LEAKED" },
      ],
    }),
    ops,
  );
  assert.equal(result.status, "failure");
  assert.match(result.reason ?? "", /scope-post/i);
  assert.equal(calls.recordUsage[0].status, "failure");
  const respMeta = calls.recordUsage[0].responseMetadata as { error: string };
  assert.match(respMeta.error, /\[scope-post-leak\]/);
  // Ein Post-Leak ist ein Code-/Drift-Problem, kein Auth-Problem —
  // daher KEIN last_error-Update.
  assert.equal(calls.recordIntegrationError.length, 0);
});

test("unclassified (non-ConnectorError) is logged and re-thrown", async () => {
  const provider = makeProvider({
    onExecute: async () => {
      throw new Error("unexpected kaboom");
    },
  });
  const { ops, calls } = makeOps({ provider });
  await assert.rejects(
    () => executeConnectorTool(baseInput(), ops),
    (err) => err instanceof Error && /kaboom/.test(err.message),
  );
  // Finally-Block hat gelogged, obwohl wir rethrown haben
  assert.equal(calls.recordUsage.length, 1);
  assert.equal(calls.recordUsage[0].status, "failure");
  const respMeta = calls.recordUsage[0].responseMetadata as { error: string };
  assert.match(respMeta.error, /\[unclassified\]/);
});

// ---------------------------------------------------------------------------
// Resilience
// ---------------------------------------------------------------------------

test("recordUsage failure does NOT blow up the tool call", async () => {
  const { ops } = makeOps({
    recordUsageThrows: new Error("DB down during log"),
  });
  // Should not throw — error gets swallowed with console.error
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const result = await executeConnectorTool(baseInput(), ops);
    assert.equal(result.status, "success");
  } finally {
    console.error = originalConsoleError;
  }
});

test("recordIntegrationError failure does NOT blow up the tool call on auth-error path", async () => {
  const provider = makeProvider({
    onExecute: async () => {
      throw new ConnectorAuthError("expired");
    },
  });
  const { ops, calls } = makeOps({
    provider,
    recordIntegrationErrorThrows: new Error("db down"),
  });
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const result = await executeConnectorTool(baseInput(), ops);
    assert.equal(result.status, "failure");
    // Usage-log still runs despite recordIntegrationError failure
    assert.equal(calls.recordUsage.length, 1);
  } finally {
    console.error = originalConsoleError;
  }
});

// ---------------------------------------------------------------------------
// Pipeline-Wiring
// ---------------------------------------------------------------------------

test("requiredScopes empty → pre-filter is no-op, provider still called", async () => {
  let providerCalled = false;
  const provider = makeProvider({
    onExecute: async () => {
      providerCalled = true;
      return { status: "success", data: null };
    },
  });
  const { ops } = makeOps({ provider });
  await executeConnectorTool(baseInput({ requiredScopes: [] }), ops);
  assert.equal(providerCalled, true);
});

test("scopeIds filter narrows context.scopes to the requested subset", async () => {
  let providerSawScopes: string[] = [];
  const provider = makeProvider({
    onExecute: async (_name, _args) => {
      // Provider sieht `context.scopes` via ExecutionContext — wir
      // prüfen indirekt, indem der Provider die Scope-Identifier in
      // einen Closure-Scoped Array schreibt. Dafür überschreiben wir
      // `executeTool`, damit wir auf `context.scopes` zugreifen können.
      return { status: "success", data: null };
    },
  });
  // Wir wrappen den Provider, damit wir den Execution-Context beobachten
  // können — Scopes werden im Gateway gefiltert, bevor sie den Provider
  // erreichen.
  const wrapped: ConnectorProvider = {
    ...provider,
    async executeTool(name, args, ctx) {
      providerSawScopes = ctx.scopes.map((s) => s.scopeIdentifier);
      return { status: "success", data: null };
    },
  };
  const { ops } = makeOps({
    provider: wrapped,
    scopes: [fakeScope("ENG"), fakeScope("PROD"), fakeScope("OPS")],
  });
  await executeConnectorTool(
    baseInput({ scopeIds: ["scope_ENG", "scope_PROD"] }),
    ops,
  );
  assert.deepEqual(providerSawScopes.sort(), ["ENG", "PROD"]);
});

test("scopeIds=[] (empty array) passes empty scopes to provider", async () => {
  let providerSawCount = -1;
  const provider = makeProvider();
  const wrapped: ConnectorProvider = {
    ...provider,
    async executeTool(_n, _a, ctx) {
      providerSawCount = ctx.scopes.length;
      return { status: "success", data: null };
    },
  };
  const { ops } = makeOps({
    provider: wrapped,
    scopes: [fakeScope("ENG"), fakeScope("PROD")],
  });
  // requiredScopes muss leer sein, sonst blockt der Pre-Filter bevor
  // wir den Provider erreichen — das zu testen ist Thema der Scope-
  // Error-Cases, nicht dieses Tests.
  await executeConnectorTool(
    baseInput({ scopeIds: [], requiredScopes: [] }),
    ops,
  );
  assert.equal(providerSawCount, 0);
});

test("scopeIds undefined (default) passes ALL integration scopes", async () => {
  let providerSawCount = -1;
  const provider = makeProvider();
  const wrapped: ConnectorProvider = {
    ...provider,
    async executeTool(_n, _a, ctx) {
      providerSawCount = ctx.scopes.length;
      return { status: "success", data: null };
    },
  };
  const { ops } = makeOps({
    provider: wrapped,
    scopes: [fakeScope("ENG"), fakeScope("PROD"), fakeScope("OPS")],
  });
  await executeConnectorTool(baseInput(), ops); // no scopeIds
  assert.equal(providerSawCount, 3);
});

test("callerUserId: null is accepted + passed to recordUsage", async () => {
  const { ops, calls } = makeOps();
  await executeConnectorTool(baseInput({ callerUserId: null }), ops);
  assert.equal(calls.recordUsage[0].userId, null);
});

test("spaceId: null is accepted + passed to recordUsage", async () => {
  const { ops, calls } = makeOps();
  await executeConnectorTool(baseInput({ spaceId: null }), ops);
  assert.equal(calls.recordUsage[0].spaceId, null);
});

test("extractObservedScopes populates post-filter check", async () => {
  const provider = makeProvider({
    onExecute: async () => ({
      status: "success",
      data: { hits: [{ spaceKey: "ENG" }] },
    }),
  });
  const { ops } = makeOps({
    provider,
    scopes: [fakeScope("ENG")],
  });
  // ENG is in allowlist, observed ENG → post-filter passes
  const result = await executeConnectorTool(
    baseInput({
      extractObservedScopes: () => [
        { type: "confluence-space", identifier: "ENG" },
      ],
    }),
    ops,
  );
  assert.equal(result.status, "success");
});
