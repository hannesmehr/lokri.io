/**
 * ConfluenceCloudClient — Auth-Header, Error-Mapping, Timeout.
 *
 * Tests laufen mit injiziertem fetch-Mock. Keine Netzwerk-Calls, keine
 * echten Atlassian-Endpoints.
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  ConnectorAuthError,
  ConnectorUpstreamError,
} from "@/lib/connectors/errors";
import {
  ConfluenceCloudClient,
} from "@/lib/connectors/providers/confluence-cloud/client";
import type { ConfluenceCloudConfig } from "@/lib/connectors/providers/confluence-cloud/config";
import type { ConfluenceCloudCredentials } from "@/lib/connectors/providers/confluence-cloud/credentials";

const CREDS: ConfluenceCloudCredentials = {
  email: "jane@empro.ch",
  apiToken: "ATATT3xFfGF0T0k3n1234567890",
};
const CONF: ConfluenceCloudConfig = {
  siteUrl: "https://empro.atlassian.net",
};

interface CapturedRequest {
  url: string;
  init: RequestInit | undefined;
}

function makeClient(handler: (req: CapturedRequest) => Response | Promise<Response>, timeoutMs?: number) {
  const captured: CapturedRequest[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    const req: CapturedRequest = { url, init };
    captured.push(req);
    return handler(req);
  };
  const client = new ConfluenceCloudClient(CREDS, CONF, {
    fetchImpl,
    timeoutMs,
  });
  return { client, captured };
}

// ---------------------------------------------------------------------------
// Auth header + URL construction
// ---------------------------------------------------------------------------

test("client: injects Basic-Auth header with base64(email:apiToken)", async () => {
  const { client, captured } = makeClient(
    () => new Response('{"ok":true}', { status: 200 }),
  );
  await client.get<{ ok: boolean }>("/wiki/rest/api/user/current");
  const auth = (captured[0].init?.headers as Record<string, string>)?.Authorization;
  assert.ok(auth);
  assert.ok(auth.startsWith("Basic "));
  const decoded = Buffer.from(auth.slice(6), "base64").toString("utf8");
  assert.equal(decoded, "jane@empro.ch:ATATT3xFfGF0T0k3n1234567890");
});

test("client: concatenates siteUrl and path correctly", async () => {
  const { client, captured } = makeClient(
    () => new Response("{}", { status: 200 }),
  );
  await client.get("/wiki/api/v2/spaces");
  assert.equal(
    captured[0].url,
    "https://empro.atlassian.net/wiki/api/v2/spaces",
  );
});

test("client: appends query string when URLSearchParams given", async () => {
  const { client, captured } = makeClient(
    () => new Response("{}", { status: 200 }),
  );
  await client.get(
    "/wiki/api/v2/spaces",
    new URLSearchParams({ type: "global", limit: "250" }),
  );
  assert.match(captured[0].url, /\?type=global&limit=250$/);
});

test("client: sets Accept: application/json and omits Content-Type on GET", async () => {
  const { client, captured } = makeClient(
    () => new Response("{}", { status: 200 }),
  );
  await client.get("/wiki/api/v2/spaces");
  const headers = captured[0].init?.headers as Record<string, string>;
  assert.equal(headers.Accept, "application/json");
  assert.equal(headers["Content-Type"], undefined);
});

test("client: sets Content-Type on POST", async () => {
  const { client, captured } = makeClient(
    () => new Response("{}", { status: 200 }),
  );
  await client.post("/wiki/rest/api/x", { hello: "world" });
  const headers = captured[0].init?.headers as Record<string, string>;
  assert.equal(headers["Content-Type"], "application/json");
  assert.equal(captured[0].init?.method, "POST");
  assert.equal(captured[0].init?.body, '{"hello":"world"}');
});

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

test("client: 401 → ConnectorAuthError", async () => {
  const { client } = makeClient(
    () => new Response("Unauthorized", { status: 401 }),
  );
  await assert.rejects(
    () => client.get("/wiki/rest/api/user/current"),
    (err) => err instanceof ConnectorAuthError && /401/.test(err.message),
  );
});

test("client: 403 → ConnectorAuthError", async () => {
  const { client } = makeClient(() => new Response("", { status: 403 }));
  await assert.rejects(
    () => client.get("/wiki/api/v2/spaces"),
    (err) => err instanceof ConnectorAuthError && /403/.test(err.message),
  );
});

test("client: 404 → ConnectorUpstreamError with status", async () => {
  const { client } = makeClient(() => new Response("", { status: 404 }));
  await assert.rejects(
    () => client.get("/wiki/api/v2/pages/999"),
    (err) =>
      err instanceof ConnectorUpstreamError &&
      err.status === 404 &&
      /404/.test(err.message),
  );
});

test("client: 429 → ConnectorUpstreamError carrying retry-after in cause", async () => {
  const { client } = makeClient(
    () =>
      new Response("", {
        status: 429,
        headers: { "retry-after": "42" },
      }),
  );
  await assert.rejects(
    () => client.get("/wiki/api/v2/spaces"),
    (err) => {
      if (!(err instanceof ConnectorUpstreamError)) return false;
      if (err.status !== 429) return false;
      const cause = err.cause as { retryAfter?: string } | undefined;
      return cause?.retryAfter === "42";
    },
  );
});

test("client: 5xx → ConnectorUpstreamError", async () => {
  const { client } = makeClient(() => new Response("", { status: 503 }));
  await assert.rejects(
    () => client.get("/wiki/api/v2/spaces"),
    (err) => err instanceof ConnectorUpstreamError && err.status === 503,
  );
});

test("client: network error → ConnectorUpstreamError with cause", async () => {
  const netErr = new Error("ENOTFOUND empro.atlassian.net");
  const { client } = makeClient(() => {
    throw netErr;
  });
  await assert.rejects(
    () => client.get("/wiki/api/v2/spaces"),
    (err) =>
      err instanceof ConnectorUpstreamError &&
      err.cause === netErr &&
      /failed/i.test(err.message),
  );
});

test("client: 204 No Content returns null", async () => {
  const { client } = makeClient(() => new Response(null, { status: 204 }));
  const result = await client.get("/wiki/api/v2/pages/1");
  assert.equal(result, null);
});

// ---------------------------------------------------------------------------
// Timeout
// ---------------------------------------------------------------------------

test("client: timeout aborts the request and wraps in ConnectorUpstreamError", async () => {
  // Fetch-Mock imitiert echten fetch: lauscht auf den AbortSignal.
  const fetchImpl: typeof fetch = (_input, init) =>
    new Promise((_, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const err = new Error("The operation was aborted");
        err.name = "AbortError";
        reject(err);
      });
    });
  const client = new ConfluenceCloudClient(CREDS, CONF, {
    fetchImpl,
    timeoutMs: 20, // kurz, damit Test schnell läuft
  });
  await assert.rejects(
    () => client.get("/wiki/api/v2/spaces"),
    (err) => {
      if (!(err instanceof ConnectorUpstreamError)) return false;
      // Client unterscheidet nicht mehr zwischen internem Timeout und
      // externem Abort — beide werden als „aborted" gemeldet, mit dem
      // ursprünglichen AbortError als `cause`.
      if (!/aborted/i.test(err.message)) return false;
      const cause = err.cause as Error | undefined;
      return cause?.name === "AbortError";
    },
  );
});

test("client: external abortSignal wins over internal timeout", async () => {
  // Externer Signal wird vor dem internen Timeout aborted.
  const externalCtrl = new AbortController();
  const fetchImpl: typeof fetch = (_input, init) =>
    new Promise((_, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        reject(err);
      });
    });
  const client = new ConfluenceCloudClient(CREDS, CONF, {
    fetchImpl,
    timeoutMs: 60_000, // lange — wird vom externen Signal überrannt
    abortSignal: externalCtrl.signal,
  });
  // Nach 10ms aborten — lange vor dem internen Timeout.
  setTimeout(() => externalCtrl.abort(), 10);
  await assert.rejects(
    () => client.get("/wiki/api/v2/spaces"),
    (err) =>
      err instanceof ConnectorUpstreamError && /aborted/i.test(err.message),
  );
});

test("client: internal timeout works even when external signal is never triggered", async () => {
  // Kein externer Signal angegeben — nur interner Timeout greift.
  const fetchImpl: typeof fetch = (_input, init) =>
    new Promise((_, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        reject(err);
      });
    });
  const client = new ConfluenceCloudClient(CREDS, CONF, {
    fetchImpl,
    timeoutMs: 20,
    // KEIN abortSignal
  });
  await assert.rejects(
    () => client.get("/wiki/api/v2/spaces"),
    (err) =>
      err instanceof ConnectorUpstreamError && /aborted/i.test(err.message),
  );
});

// ---------------------------------------------------------------------------
// Security: no auth leakage in error messages
// ---------------------------------------------------------------------------

test("client: error message never contains the raw token or email", async () => {
  const { client } = makeClient(() => new Response("", { status: 500 }));
  try {
    await client.get("/wiki/api/v2/spaces?surprise=1");
  } catch (err) {
    if (err instanceof Error) {
      assert.ok(!err.message.includes("ATATT3xFfGF0T0k3n1234567890"));
      assert.ok(!err.message.includes("jane@empro.ch"));
      // Auch der base64-encoded Token darf nicht erscheinen:
      const b64 = Buffer.from(
        "jane@empro.ch:ATATT3xFfGF0T0k3n1234567890",
        "utf8",
      ).toString("base64");
      assert.ok(!err.message.includes(b64));
      // Query-Params werden bewusst nicht in die Message geloggt:
      assert.ok(!err.message.includes("surprise"));
    } else {
      throw new Error("expected Error");
    }
  }
});
