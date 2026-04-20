/**
 * Zod-Schema-Tests für die Team-Connector-Admin-API.
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  addMappingSchema,
  createIntegrationSchema,
  patchIntegrationSchema,
  replaceScopesSchema,
  rotateCredentialsSchema,
  validateCredentialsSchema,
} from "@/lib/teams/connectors-schemas";

const VALID_EMAIL = "jane@empro.ch";
const VALID_TOKEN = "ATATT3xFfGF0T0k3n1234567890";
const VALID_SITE = "https://empro.atlassian.net";

// ---------------------------------------------------------------------------
// createIntegrationSchema
// ---------------------------------------------------------------------------

test("createIntegrationSchema: full happy path with scopes + mappings", () => {
  const parsed = createIntegrationSchema.parse({
    connector_type: "confluence-cloud",
    display_name: "Empro",
    credentials: { email: VALID_EMAIL, apiToken: VALID_TOKEN },
    config: { siteUrl: VALID_SITE },
    scopes: [
      {
        scope_type: "confluence-space",
        scope_identifier: "ENG",
        scope_metadata: { displayName: "Engineering" },
      },
      { scope_type: "confluence-space", scope_identifier: "DOC" },
    ],
    mappings: [
      {
        space_id: "0193d01a-aaaa-7000-bbbb-000000000001",
        scope_identifier: "ENG",
      },
    ],
  });
  assert.equal(parsed.scopes.length, 2);
  assert.equal(parsed.mappings.length, 1);
});

test("createIntegrationSchema: mappings default to empty array", () => {
  const parsed = createIntegrationSchema.parse({
    connector_type: "confluence-cloud",
    display_name: "Empro",
    credentials: { email: VALID_EMAIL, apiToken: VALID_TOKEN },
    config: { siteUrl: VALID_SITE },
    scopes: [
      { scope_type: "confluence-space", scope_identifier: "ENG" },
    ],
  });
  assert.deepEqual(parsed.mappings, []);
});

test("createIntegrationSchema: rejects empty scopes array", () => {
  assert.throws(() =>
    createIntegrationSchema.parse({
      connector_type: "confluence-cloud",
      display_name: "Empro",
      credentials: { email: VALID_EMAIL, apiToken: VALID_TOKEN },
      config: { siteUrl: VALID_SITE },
      scopes: [],
    }),
  );
});

test("createIntegrationSchema: rejects non-uuid space_id in mappings", () => {
  assert.throws(() =>
    createIntegrationSchema.parse({
      connector_type: "confluence-cloud",
      display_name: "Empro",
      credentials: { email: VALID_EMAIL, apiToken: VALID_TOKEN },
      config: { siteUrl: VALID_SITE },
      scopes: [
        { scope_type: "confluence-space", scope_identifier: "ENG" },
      ],
      mappings: [{ space_id: "not-a-uuid", scope_identifier: "ENG" }],
    }),
  );
});

test("createIntegrationSchema: rejects unsupported connector_type", () => {
  const result = createIntegrationSchema.safeParse({
    connector_type: "slack",
    display_name: "Slack",
    credentials: {},
    config: {},
    scopes: [],
  });
  assert.equal(result.success, false);
});

test("createIntegrationSchema: caps display_name at 100 chars", () => {
  assert.throws(() =>
    createIntegrationSchema.parse({
      connector_type: "confluence-cloud",
      display_name: "A".repeat(101),
      credentials: { email: VALID_EMAIL, apiToken: VALID_TOKEN },
      config: { siteUrl: VALID_SITE },
      scopes: [
        { scope_type: "confluence-space", scope_identifier: "ENG" },
      ],
    }),
  );
});

// ---------------------------------------------------------------------------
// patchIntegrationSchema
// ---------------------------------------------------------------------------

test("patchIntegrationSchema: display_name only", () => {
  const parsed = patchIntegrationSchema.parse({ display_name: "New name" });
  assert.equal(parsed.display_name, "New name");
});

test("patchIntegrationSchema: enabled only", () => {
  const parsed = patchIntegrationSchema.parse({ enabled: false });
  assert.equal(parsed.enabled, false);
});

test("patchIntegrationSchema: rejects empty body (at least one field required)", () => {
  assert.throws(() => patchIntegrationSchema.parse({}));
});

// ---------------------------------------------------------------------------
// rotateCredentialsSchema
// ---------------------------------------------------------------------------

test("rotateCredentialsSchema: parses full Confluence payload", () => {
  const parsed = rotateCredentialsSchema.parse({
    connector_type: "confluence-cloud",
    credentials: { email: VALID_EMAIL, apiToken: VALID_TOKEN },
    config: { siteUrl: VALID_SITE },
  });
  assert.equal(parsed.connector_type, "confluence-cloud");
});

test("rotateCredentialsSchema: rejects non-*.atlassian.net siteUrl", () => {
  assert.throws(() =>
    rotateCredentialsSchema.parse({
      connector_type: "confluence-cloud",
      credentials: { email: VALID_EMAIL, apiToken: VALID_TOKEN },
      config: { siteUrl: "https://evil.example.com" },
    }),
  );
});

// ---------------------------------------------------------------------------
// validateCredentialsSchema
// ---------------------------------------------------------------------------

test("validateCredentialsSchema: matches rotateCredentials-Shape (pre-persist)", () => {
  const parsed = validateCredentialsSchema.parse({
    connector_type: "confluence-cloud",
    credentials: { email: VALID_EMAIL, apiToken: VALID_TOKEN },
    config: { siteUrl: VALID_SITE },
  });
  assert.equal(parsed.connector_type, "confluence-cloud");
});

// ---------------------------------------------------------------------------
// replaceScopesSchema
// ---------------------------------------------------------------------------

test("replaceScopesSchema: requires min 1 scope (empty allowlist = nutzlos)", () => {
  assert.throws(() => replaceScopesSchema.parse({ scopes: [] }));
});

test("replaceScopesSchema: passes with 1 scope", () => {
  const parsed = replaceScopesSchema.parse({
    scopes: [{ scope_type: "confluence-space", scope_identifier: "ENG" }],
  });
  assert.equal(parsed.scopes.length, 1);
});

// ---------------------------------------------------------------------------
// addMappingSchema
// ---------------------------------------------------------------------------

test("addMappingSchema: parses valid payload", () => {
  const parsed = addMappingSchema.parse({
    space_id: "0193d01a-aaaa-7000-bbbb-000000000001",
    scope_identifier: "ENG",
  });
  assert.equal(parsed.scope_identifier, "ENG");
});

test("addMappingSchema: rejects invalid UUID", () => {
  assert.throws(() =>
    addMappingSchema.parse({
      space_id: "not-a-uuid",
      scope_identifier: "ENG",
    }),
  );
});
