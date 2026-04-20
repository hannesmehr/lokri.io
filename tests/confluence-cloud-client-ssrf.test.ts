/**
 * SSRF-Regression-Tests für ConfluenceCloudClient.
 *
 * Deckt fünf Cases ab:
 *   1. Foreign-Host in `_links.next` → Error, kein fetch
 *   2. Relative Pfad → normal durch
 *   3. Absolute same-origin URL → normal durch
 *   4. Protocol-relative URL (`//evil.com/…`) → blockiert
 *   5. Upper-case Host-Variation → normalisiert, als same-origin akzeptiert
 *
 * Der Check sitzt zentral in `request()`, daher testen wir auch
 * implizit `get()` + `post()` — aber explizit via `getAbsolute()`,
 * weil das die User-input-URL-Pfad ist (Pagination).
 */

import assert from "node:assert/strict";
import test from "node:test";
import { ConnectorUpstreamError } from "@/lib/connectors/errors";
import { ConfluenceCloudClient } from "@/lib/connectors/providers/confluence-cloud/client";
import type { ConfluenceCloudConfig } from "@/lib/connectors/providers/confluence-cloud/config";
import type { ConfluenceCloudCredentials } from "@/lib/connectors/providers/confluence-cloud/credentials";

const CREDS: ConfluenceCloudCredentials = {
  email: "jane@empro.ch",
  apiToken: "ATATT3xFfGF0T0k3n1234567890",
};
const CONF: ConfluenceCloudConfig = {
  siteUrl: "https://empro.atlassian.net",
};

interface Captured {
  url: string;
}

function makeClient(): { client: ConfluenceCloudClient; captured: Captured[] } {
  const captured: Captured[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    captured.push({ url });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  return {
    client: new ConfluenceCloudClient(CREDS, CONF, { fetchImpl }),
    captured,
  };
}

// ---------------------------------------------------------------------------
// Block: Foreign-Host
// ---------------------------------------------------------------------------

test("ssrf: getAbsolute rejects absolute URL with foreign host", async () => {
  const { client, captured } = makeClient();
  await assert.rejects(
    () =>
      client.getAbsolute(
        "https://evil.example.com/wiki/api/v2/spaces?cursor=abc",
      ),
    (err) =>
      err instanceof ConnectorUpstreamError &&
      /same-origin/i.test(err.message) &&
      /evil\.example\.com/.test(err.message),
  );
  // Kritisch: fetch wurde NIE aufgerufen — Auth-Header leakt nicht.
  assert.equal(captured.length, 0);
});

test("ssrf: getAbsolute rejects protocol-relative URL resolving off-host", async () => {
  const { client, captured } = makeClient();
  // `new URL("//evil.com/path", "https://empro.atlassian.net")`
  // resolved zu `https://evil.com/path` — genau der SSRF-Vektor den
  // die Regex-basierte alte Variante übersah.
  await assert.rejects(
    () => client.getAbsolute("//evil.com/wiki/api/v2/spaces?cursor=abc"),
    (err) =>
      err instanceof ConnectorUpstreamError &&
      /same-origin/i.test(err.message) &&
      /evil\.com/.test(err.message),
  );
  assert.equal(captured.length, 0);
});

test("ssrf: getAbsolute rejects different port on same host", async () => {
  // Same host, aber Port 8080 — sollte auch abgelehnt werden, weil
  // Origin = protocol + host + port.
  const { client, captured } = makeClient();
  await assert.rejects(
    () =>
      client.getAbsolute(
        "https://empro.atlassian.net:8080/wiki/api/v2/spaces",
      ),
    (err) => err instanceof ConnectorUpstreamError,
  );
  assert.equal(captured.length, 0);
});

test("ssrf: getAbsolute rejects http:// downgrade on same host", async () => {
  // Protocol-Downgrade (https → http) ist auch Origin-Mismatch.
  const { client, captured } = makeClient();
  await assert.rejects(
    () =>
      client.getAbsolute("http://empro.atlassian.net/wiki/api/v2/spaces"),
    (err) => err instanceof ConnectorUpstreamError,
  );
  assert.equal(captured.length, 0);
});

// ---------------------------------------------------------------------------
// Block: Positive cases (muss weiter funktionieren)
// ---------------------------------------------------------------------------

test("ssrf: getAbsolute accepts relative path — resolved to same origin", async () => {
  const { client, captured } = makeClient();
  await client.getAbsolute("/wiki/api/v2/spaces?cursor=abc");
  assert.equal(captured.length, 1);
  assert.equal(
    captured[0].url,
    "https://empro.atlassian.net/wiki/api/v2/spaces?cursor=abc",
  );
});

test("ssrf: getAbsolute accepts absolute URL with identical origin", async () => {
  const { client, captured } = makeClient();
  await client.getAbsolute(
    "https://empro.atlassian.net/wiki/api/v2/spaces?cursor=abc",
  );
  assert.equal(captured.length, 1);
  assert.equal(
    captured[0].url,
    "https://empro.atlassian.net/wiki/api/v2/spaces?cursor=abc",
  );
});

test("ssrf: getAbsolute accepts uppercase host (URL parser normalises)", async () => {
  const { client, captured } = makeClient();
  // `new URL("https://EMPRO.atlassian.net/...").origin` ist
  // `https://empro.atlassian.net` — URL-Parser lowercased den Host.
  await client.getAbsolute(
    "https://EMPRO.atlassian.net/wiki/api/v2/spaces?cursor=abc",
  );
  assert.equal(captured.length, 1);
  // Output-URL ist case-normalisiert:
  assert.equal(
    captured[0].url,
    "https://empro.atlassian.net/wiki/api/v2/spaces?cursor=abc",
  );
});

// ---------------------------------------------------------------------------
// Block: Security — Auth-Header leakt nicht in Error-Message
// ---------------------------------------------------------------------------

test("ssrf: foreign-host error message does not contain credentials", async () => {
  const { client } = makeClient();
  try {
    await client.getAbsolute("https://evil.example.com/steal");
    assert.fail("Expected throw");
  } catch (err) {
    assert.ok(err instanceof Error);
    assert.ok(
      !err.message.includes("ATATT3xFfGF0T0k3n1234567890"),
      "raw token must not appear in SSRF error message",
    );
    assert.ok(
      !err.message.includes("jane@empro.ch"),
      "email must not appear in SSRF error message",
    );
    const b64 = Buffer.from(
      "jane@empro.ch:ATATT3xFfGF0T0k3n1234567890",
      "utf8",
    ).toString("base64");
    assert.ok(
      !err.message.includes(b64),
      "base64 auth header must not appear in SSRF error message",
    );
  }
});
