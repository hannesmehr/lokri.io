import assert from "node:assert/strict";
import test from "node:test";
import {
  buildConfluenceUrl,
  confluenceCloudConfigSchema,
} from "@/lib/connectors/providers/confluence-cloud/config";
import { confluenceCloudCredentialsSchema } from "@/lib/connectors/providers/confluence-cloud/credentials";

// ---------------------------------------------------------------------------
// Config-Schema
// ---------------------------------------------------------------------------

test("config: accepts a standard atlassian.net URL and strips trailing slash", () => {
  const parsed = confluenceCloudConfigSchema.parse({
    siteUrl: "https://empro.atlassian.net/",
  });
  assert.equal(parsed.siteUrl, "https://empro.atlassian.net");
});

test("config: accepts a URL without trailing slash as-is", () => {
  const parsed = confluenceCloudConfigSchema.parse({
    siteUrl: "https://empro.atlassian.net",
  });
  assert.equal(parsed.siteUrl, "https://empro.atlassian.net");
});

test("config: rejects non-https (http)", () => {
  assert.throws(() =>
    confluenceCloudConfigSchema.parse({
      siteUrl: "http://empro.atlassian.net",
    }),
  );
});

test("config: rejects arbitrary domains (not *.atlassian.net)", () => {
  assert.throws(() =>
    confluenceCloudConfigSchema.parse({
      siteUrl: "https://evil.example.com",
    }),
  );
});

test("config: rejects subdomain with path other than root", () => {
  // `https://empro.atlassian.net/wiki` — user-supplied paths are stripped
  // to avoid ambiguity; we build paths ourselves.
  // Actually our schema rejects anything that's not a pure host URL.
  // Let's confirm that.
  const result = confluenceCloudConfigSchema.safeParse({
    siteUrl: "https://empro.atlassian.net/wiki",
  });
  // Pure host expected — trailing-slash variants get normalised, but
  // a path component is out of scope.
  // NOTE: current schema only strips `/+$`, doesn't reject path. We
  // don't over-validate — buildConfluenceUrl handles concat cleanly.
  // Document the behaviour: siteUrl with /wiki still parses to
  // `https://empro.atlassian.net/wiki`. That would double `/wiki` in
  // all calls. Fail loudly in the refine.
  assert.equal(result.success, false);
});

test("config: rejects unknown keys (strict)", () => {
  assert.throws(() =>
    confluenceCloudConfigSchema.parse({
      siteUrl: "https://empro.atlassian.net",
      surpriseField: "nope",
    }),
  );
});

// ---------------------------------------------------------------------------
// buildConfluenceUrl
// ---------------------------------------------------------------------------

test("buildConfluenceUrl: no trailing/leading-slash gymnastics", () => {
  const base = "https://empro.atlassian.net";
  assert.equal(
    buildConfluenceUrl(base, "/wiki/api/v2/spaces"),
    "https://empro.atlassian.net/wiki/api/v2/spaces",
  );
  assert.equal(
    buildConfluenceUrl(base, "wiki/api/v2/spaces"),
    "https://empro.atlassian.net/wiki/api/v2/spaces",
  );
  assert.equal(
    buildConfluenceUrl(`${base}///`, "/wiki/x"),
    "https://empro.atlassian.net/wiki/x",
  );
});

// ---------------------------------------------------------------------------
// Credentials-Schema
// ---------------------------------------------------------------------------

test("credentials: accepts email + long api-token", () => {
  const parsed = confluenceCloudCredentialsSchema.parse({
    email: "  jane@empro.ch  ",
    apiToken: "ATATT3xFfGF0T0k3n1234567890abcdef",
  });
  assert.equal(parsed.email, "jane@empro.ch");
  assert.equal(parsed.apiToken, "ATATT3xFfGF0T0k3n1234567890abcdef");
});

test("credentials: rejects invalid email format", () => {
  assert.throws(() =>
    confluenceCloudCredentialsSchema.parse({
      email: "not-an-email",
      apiToken: "ATATT3xFfGF0T0k3n1234567890",
    }),
  );
});

test("credentials: rejects too-short api-token (sanity guard)", () => {
  assert.throws(() =>
    confluenceCloudCredentialsSchema.parse({
      email: "jane@empro.ch",
      apiToken: "short",
    }),
  );
});
