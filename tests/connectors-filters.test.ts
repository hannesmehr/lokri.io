import assert from "node:assert/strict";
import test from "node:test";
import {
  ConnectorScopeError,
  ConnectorScopePostError,
} from "@/lib/connectors/errors";
import {
  MVP_PIPELINE,
  runPipeline,
  scopeEnforcementFilter,
  scopePostFilter,
} from "@/lib/connectors/filters";
import type {
  ConnectorFilter,
  InnerExecution,
  RequestContext,
  ScopeRef,
} from "@/lib/connectors/filters";
import type {
  ConnectorIntegration,
  ConnectorScope,
  ExecutionContext,
} from "@/lib/connectors/types";

// Minimal fixture builders — keep call-sites readable.

function fakeIntegration(): ConnectorIntegration {
  const now = new Date("2026-04-20T00:00:00.000Z");
  return {
    id: "00000000-0000-0000-0000-000000000001",
    ownerAccountId: "00000000-0000-0000-0000-000000000002",
    connectorType: "confluence-cloud",
    displayName: "Test Integration",
    authType: "pat",
    credentialsEncrypted: "v1:unused",
    config: {},
    enabled: true,
    lastTestedAt: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };
}

function fakeScope(identifier: string): ConnectorScope {
  return {
    id: `scope-${identifier}`,
    connectorIntegrationId: "00000000-0000-0000-0000-000000000001",
    scopeType: "confluence-space",
    scopeIdentifier: identifier,
    scopeMetadata: null,
    createdAt: new Date("2026-04-20T00:00:00.000Z"),
  };
}

function buildContext(
  allowedScopes: string[],
  required: ScopeRef[],
  toolName = "search",
): RequestContext {
  const execution: ExecutionContext = {
    integration: fakeIntegration(),
    scopes: allowedScopes.map(fakeScope),
    callerUserId: "user_1",
    spaceId: "00000000-0000-0000-0000-000000000003",
  };
  return {
    toolName,
    args: {},
    executionContext: execution,
    requiredScopes: required,
  };
}

// ---------------------------------------------------------------------------
// scope-enforcement
// ---------------------------------------------------------------------------

test("scopeEnforcementFilter passes through when required ⊆ allowed", async () => {
  const ctx = buildContext(
    ["ENG", "DOC"],
    [{ type: "confluence-space", identifier: "ENG" }],
  );
  const out = await scopeEnforcementFilter.requestPhase!(ctx);
  assert.strictEqual(out, ctx);
});

test("scopeEnforcementFilter throws ConnectorScopeError when required ⊄ allowed", async () => {
  const ctx = buildContext(
    ["ENG"],
    [{ type: "confluence-space", identifier: "SECRET" }],
  );
  await assert.rejects(
    async () => scopeEnforcementFilter.requestPhase!(ctx),
    (err) =>
      err instanceof ConnectorScopeError &&
      err.requestedScope.identifier === "SECRET",
  );
});

test("scopeEnforcementFilter is no-op when requiredScopes is empty", async () => {
  const ctx = buildContext([], []);
  const out = await scopeEnforcementFilter.requestPhase!(ctx);
  assert.strictEqual(out, ctx);
});

test("scopeEnforcementFilter differentiates identifier-collision across types", async () => {
  // Same identifier, different type ⇒ no match
  const ctx: RequestContext = {
    toolName: "search",
    args: {},
    executionContext: {
      integration: fakeIntegration(),
      scopes: [
        {
          ...fakeScope("X"),
          scopeType: "github-repo",
        },
      ],
      callerUserId: "user_1",
      spaceId: "space_1",
    },
    requiredScopes: [{ type: "confluence-space", identifier: "X" }],
  };
  await assert.rejects(
    async () => scopeEnforcementFilter.requestPhase!(ctx),
    (err) => err instanceof ConnectorScopeError,
  );
});

// ---------------------------------------------------------------------------
// scope-post
// ---------------------------------------------------------------------------

test("scopePostFilter passes when observed ⊆ allowed", async () => {
  const base = buildContext(["ENG", "DOC"], []);
  const resCtx = {
    toolName: base.toolName,
    args: base.args,
    executionContext: base.executionContext,
    result: { status: "success" as const, data: [] },
    observedScopes: [
      { type: "confluence-space", identifier: "ENG" },
    ] satisfies ScopeRef[],
  };
  const out = await scopePostFilter.responsePhase!(resCtx);
  assert.strictEqual(out, resCtx);
});

test("scopePostFilter throws ConnectorScopePostError on leak", async () => {
  const base = buildContext(["ENG"], []);
  const resCtx = {
    toolName: base.toolName,
    args: base.args,
    executionContext: base.executionContext,
    result: { status: "success" as const, data: [] },
    observedScopes: [
      { type: "confluence-space", identifier: "LEAKED" },
    ] satisfies ScopeRef[],
  };
  await assert.rejects(
    async () => scopePostFilter.responsePhase!(resCtx),
    (err) =>
      err instanceof ConnectorScopePostError &&
      err.leakedScope.identifier === "LEAKED",
  );
});

test("scopePostFilter is no-op when observedScopes is empty", async () => {
  const base = buildContext([], []);
  const resCtx = {
    toolName: base.toolName,
    args: base.args,
    executionContext: base.executionContext,
    result: { status: "success" as const, data: [] },
    observedScopes: [],
  };
  const out = await scopePostFilter.responsePhase!(resCtx);
  assert.strictEqual(out, resCtx);
});

// ---------------------------------------------------------------------------
// runPipeline
// ---------------------------------------------------------------------------

test("runPipeline executes pre → inner → post in order", async () => {
  const order: string[] = [];
  const filterA: ConnectorFilter = {
    name: "A",
    async requestPhase(ctx) {
      order.push("A.pre");
      return ctx;
    },
    async responsePhase(ctx) {
      order.push("A.post");
      return ctx;
    },
  };
  const filterB: ConnectorFilter = {
    name: "B",
    async requestPhase(ctx) {
      order.push("B.pre");
      return ctx;
    },
    async responsePhase(ctx) {
      order.push("B.post");
      return ctx;
    },
  };
  const initial = buildContext([], []);
  await runPipeline([filterA, filterB], initial, async (): Promise<InnerExecution> => {
    order.push("inner");
    return {
      result: { status: "success", data: null },
      observedScopes: [],
    };
  });
  assert.deepEqual(order, ["A.pre", "B.pre", "inner", "A.post", "B.post"]);
});

test("runPipeline skips inner + post when pre-filter throws", async () => {
  let innerCalled = false;
  let postCalled = false;
  const throwing: ConnectorFilter = {
    name: "throws",
    requestPhase() {
      throw new ConnectorScopeError({
        type: "confluence-space",
        identifier: "NOPE",
      });
    },
    responsePhase(ctx) {
      postCalled = true;
      return ctx;
    },
  };
  const initial = buildContext([], []);
  await assert.rejects(
    async () =>
      runPipeline([throwing], initial, async () => {
        innerCalled = true;
        return { result: { status: "success", data: null }, observedScopes: [] };
      }),
    (err) => err instanceof ConnectorScopeError,
  );
  assert.equal(innerCalled, false);
  assert.equal(postCalled, false);
});

test("runPipeline propagates inner errors without running post-filters", async () => {
  let postCalled = false;
  const postFilter: ConnectorFilter = {
    name: "post",
    responsePhase(ctx) {
      postCalled = true;
      return ctx;
    },
  };
  const initial = buildContext([], []);
  await assert.rejects(
    async () =>
      runPipeline([postFilter], initial, async () => {
        throw new Error("upstream down");
      }),
    (err) => err instanceof Error && /upstream down/.test(err.message),
  );
  assert.equal(postCalled, false);
});

test("MVP_PIPELINE blocks out-of-allowlist request pre-inner", async () => {
  let innerCalled = false;
  const ctx = buildContext(
    ["ENG"],
    [{ type: "confluence-space", identifier: "SECRET" }],
  );
  await assert.rejects(
    async () =>
      runPipeline(MVP_PIPELINE, ctx, async () => {
        innerCalled = true;
        return {
          result: { status: "success", data: null },
          observedScopes: [],
        };
      }),
    (err) => err instanceof ConnectorScopeError,
  );
  assert.equal(innerCalled, false, "upstream must not be reached");
});

test("MVP_PIPELINE catches response leak via scope-post", async () => {
  const ctx = buildContext(
    ["ENG"],
    [{ type: "confluence-space", identifier: "ENG" }],
  );
  await assert.rejects(
    async () =>
      runPipeline(MVP_PIPELINE, ctx, async () => ({
        result: { status: "success", data: [{ spaceKey: "LEAKED" }] },
        observedScopes: [
          { type: "confluence-space", identifier: "LEAKED" },
        ],
      })),
    (err) => err instanceof ConnectorScopePostError,
  );
});
