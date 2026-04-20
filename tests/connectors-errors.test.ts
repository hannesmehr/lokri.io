import assert from "node:assert/strict";
import test from "node:test";
import {
  ConnectorAuthError,
  ConnectorConfigError,
  ConnectorError,
  ConnectorScopeError,
  ConnectorScopePostError,
  ConnectorUpstreamError,
} from "@/lib/connectors/errors";

test("ConnectorAuthError carries kind='auth' and is a ConnectorError", () => {
  const err = new ConnectorAuthError("Token rejected by Confluence");
  assert.equal(err.kind, "auth");
  assert.equal(err.name, "ConnectorAuthError");
  assert.ok(err instanceof ConnectorError);
  assert.ok(err instanceof Error);
});

test("ConnectorScopeError exposes requestedScope", () => {
  const err = new ConnectorScopeError({
    type: "confluence-space",
    identifier: "SECRET",
  });
  assert.equal(err.kind, "scope");
  assert.deepEqual(err.requestedScope, {
    type: "confluence-space",
    identifier: "SECRET",
  });
  assert.match(err.message, /SECRET/);
});

test("ConnectorScopePostError exposes leakedScope with default message", () => {
  const err = new ConnectorScopePostError({
    type: "confluence-space",
    identifier: "LEAKED",
  });
  assert.equal(err.kind, "scope-post");
  assert.deepEqual(err.leakedScope, {
    type: "confluence-space",
    identifier: "LEAKED",
  });
});

test("ConnectorUpstreamError preserves HTTP status", () => {
  const err = new ConnectorUpstreamError("Upstream 500", { status: 500 });
  assert.equal(err.kind, "upstream");
  assert.equal(err.status, 500);
});

test("ConnectorConfigError marks config/programming errors", () => {
  const err = new ConnectorConfigError("No provider for 'confluence-cloud'");
  assert.equal(err.kind, "config");
});
