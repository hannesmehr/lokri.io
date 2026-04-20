/**
 * `testCredentials` — Setup-Validation gegen v1 `/wiki/rest/api/user/current`.
 *
 * Fehler aus dem Client werden hier in `TestResult` verpackt (ok=false)
 * statt hochzureichen — das ist das „User-gibt-falsches-Token-ein"-UX.
 * Zod-Validation-Fehler hingegen fliegen hoch (Caller-Bug).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { ConfluenceCloudProvider } from "@/lib/connectors/providers/confluence-cloud/provider";

const FIXTURES = resolve(
  process.cwd(),
  "lib/connectors/providers/confluence-cloud/__fixtures__",
);

const USER_CURRENT = JSON.parse(
  readFileSync(resolve(FIXTURES, "user-current.json"), "utf8"),
);

const VALID_CREDS = {
  email: "jane@empro.ch",
  apiToken: "ATATT3xFfGF0T0k3n1234567890",
};
const VALID_CONFIG = { siteUrl: "https://empro.atlassian.net" };

function providerWith(
  handler: (url: string) => Response | Promise<Response>,
): ConfluenceCloudProvider {
  const fetchImpl: typeof fetch = async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    return handler(url);
  };
  return new ConfluenceCloudProvider({ fetchImpl });
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

test("testCredentials: valid creds → ok=true with display name and diagnostics", async () => {
  const provider = providerWith((url) => {
    assert.match(url, /\/wiki\/rest\/api\/user\/current$/);
    return new Response(JSON.stringify(USER_CURRENT), { status: 200 });
  });
  const result = await provider.testCredentials(VALID_CREDS, VALID_CONFIG);
  assert.equal(result.ok, true);
  assert.match(result.message, /Jane Empro/);
  assert.equal(result.diagnostics?.accountId, USER_CURRENT.accountId);
  assert.equal(result.diagnostics?.email, USER_CURRENT.email);
  assert.equal(result.diagnostics?.apiVersion, "v1");
});

test("testCredentials: missing publicName → falls back to displayName or 'Unbekannt'", async () => {
  const provider = providerWith(
    () =>
      new Response(
        JSON.stringify({
          type: "known",
          accountId: "712020:xyz",
        }),
        { status: 200 },
      ),
  );
  const result = await provider.testCredentials(VALID_CREDS, VALID_CONFIG);
  assert.equal(result.ok, true);
  assert.match(result.message, /Unbekannt/);
});

// ---------------------------------------------------------------------------
// Error paths — wrapped in TestResult
// ---------------------------------------------------------------------------

test("testCredentials: 401 → ok=false with German message", async () => {
  const provider = providerWith(
    () => new Response("Unauthorized", { status: 401 }),
  );
  const result = await provider.testCredentials(VALID_CREDS, VALID_CONFIG);
  assert.equal(result.ok, false);
  assert.match(result.message, /abgelehnt/i);
});

test("testCredentials: 503 → ok=false with reachability message", async () => {
  const provider = providerWith(
    () => new Response("", { status: 503 }),
  );
  const result = await provider.testCredentials(VALID_CREDS, VALID_CONFIG);
  assert.equal(result.ok, false);
  assert.match(result.message, /nicht erreichbar/i);
  assert.equal(result.diagnostics?.httpStatus, 503);
});

test("testCredentials: timeout → ok=false with reachability message", async () => {
  const provider = new ConfluenceCloudProvider({
    timeoutMs: 20,
    fetchImpl: (_input, init) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      }),
  });
  const result = await provider.testCredentials(VALID_CREDS, VALID_CONFIG);
  assert.equal(result.ok, false);
  assert.match(result.message, /nicht erreichbar/i);
});

// ---------------------------------------------------------------------------
// Error paths — NOT wrapped (thrown)
// ---------------------------------------------------------------------------

test("testCredentials: invalid credentials shape throws ZodError", async () => {
  const provider = providerWith(() => new Response("{}", { status: 200 }));
  await assert.rejects(
    () => provider.testCredentials({ email: "not-email", apiToken: "x" }, VALID_CONFIG),
  );
});

test("testCredentials: invalid config shape throws ZodError", async () => {
  const provider = providerWith(() => new Response("{}", { status: 200 }));
  await assert.rejects(
    () => provider.testCredentials(VALID_CREDS, { siteUrl: "https://evil.example.com" }),
  );
});
