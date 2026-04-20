import assert from "node:assert/strict";
import test from "node:test";
import { ConnectorConfigError } from "@/lib/connectors/errors";
import {
  __resetForTests,
  get as getConnectorProvider,
  has as hasConnectorProvider,
  list as listConnectorProviders,
  register as registerConnectorProvider,
} from "@/lib/connectors/registry";
import type { ConnectorProvider } from "@/lib/connectors/provider";
import type { ConnectorDefinition } from "@/lib/connectors/types";

function fakeProvider(id: string): ConnectorProvider {
  const definition: ConnectorDefinition = {
    id,
    name: id,
    description: "fake",
    icon: "plug",
    category: "knowledge",
    authType: "pat",
    scopeModel: {
      type: `${id}-scope`,
      label: "Scopes",
      identifierLabel: "Key",
    },
    tools: ["search"],
  };
  return {
    definition,
    async testCredentials() {
      return { ok: true, message: "fake" };
    },
    async discoverScopes() {
      return [];
    },
    async executeTool() {
      return { status: "success", data: null };
    },
  };
}

test("registerConnectorProvider + get round-trips", () => {
  __resetForTests();
  const provider = fakeProvider("confluence-cloud");
  registerConnectorProvider(provider);
  assert.equal(hasConnectorProvider("confluence-cloud"), true);
  assert.strictEqual(getConnectorProvider("confluence-cloud"), provider);
});

test("duplicate register throws ConnectorConfigError with id in message", () => {
  __resetForTests();
  registerConnectorProvider(fakeProvider("confluence-cloud"));
  assert.throws(
    () => registerConnectorProvider(fakeProvider("confluence-cloud")),
    (err) =>
      err instanceof ConnectorConfigError &&
      /confluence-cloud/.test(err.message),
  );
});

test("get unknown throws ConnectorConfigError listing known types", () => {
  __resetForTests();
  registerConnectorProvider(fakeProvider("confluence-cloud"));
  assert.throws(
    () => getConnectorProvider("slack"),
    (err) =>
      err instanceof ConnectorConfigError &&
      /slack/.test(err.message) &&
      /confluence-cloud/.test(err.message),
  );
});

test("list returns all registered providers", () => {
  __resetForTests();
  const a = fakeProvider("a");
  const b = fakeProvider("b");
  registerConnectorProvider(a);
  registerConnectorProvider(b);
  const providers = listConnectorProviders();
  assert.equal(providers.length, 2);
  assert.ok(providers.includes(a));
  assert.ok(providers.includes(b));
});

test("__resetForTests empties the registry", () => {
  __resetForTests();
  registerConnectorProvider(fakeProvider("a"));
  __resetForTests();
  assert.equal(listConnectorProviders().length, 0);
  assert.equal(hasConnectorProvider("a"), false);
});
