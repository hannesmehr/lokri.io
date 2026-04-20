import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeArgs } from "@/lib/connectors/sanitize";

test("sanitizeArgs redacts common secret key names", () => {
  const out = sanitizeArgs({
    pat: "ATATT3x",
    token: "xoxb-…",
    password: "hunter2",
    secret: "nope",
    apiKey: "sk-…",
    api_key: "also-sk",
    credentials: { email: "a@b", pat: "should be gone" },
    authorization: "Bearer x",
  });
  assert.deepEqual(out, {
    pat: "[REDACTED]",
    token: "[REDACTED]",
    password: "[REDACTED]",
    secret: "[REDACTED]",
    apiKey: "[REDACTED]",
    api_key: "[REDACTED]",
    credentials: "[REDACTED]",
    authorization: "[REDACTED]",
  });
});

test("sanitizeArgs is case-insensitive and strips separators", () => {
  const out = sanitizeArgs({
    PAT: "x",
    "Api-Key": "y",
    "CLIENT_SECRET": "z",
    "access token": "a",
  });
  assert.deepEqual(out, {
    PAT: "[REDACTED]",
    "Api-Key": "[REDACTED]",
    CLIENT_SECRET: "[REDACTED]",
    "access token": "[REDACTED]",
  });
});

test("sanitizeArgs leaves non-secret keys untouched", () => {
  const out = sanitizeArgs({
    query: "lokri architecture",
    spaceKey: "ENG",
    limit: 20,
    apiVersion: "v2",
  });
  assert.deepEqual(out, {
    query: "lokri architecture",
    spaceKey: "ENG",
    limit: 20,
    apiVersion: "v2",
  });
});

test("sanitizeArgs recurses into nested objects + arrays", () => {
  const out = sanitizeArgs({
    config: { siteUrl: "https://x.y", token: "secret" },
    list: [
      { id: 1, password: "a" },
      { id: 2, password: "b" },
    ],
  });
  assert.deepEqual(out, {
    config: { siteUrl: "https://x.y", token: "[REDACTED]" },
    list: [
      { id: 1, password: "[REDACTED]" },
      { id: 2, password: "[REDACTED]" },
    ],
  });
});

test("sanitizeArgs preserves primitives", () => {
  assert.equal(sanitizeArgs("hello"), "hello");
  assert.equal(sanitizeArgs(42), 42);
  assert.equal(sanitizeArgs(true), true);
  assert.equal(sanitizeArgs(null), null);
  assert.equal(sanitizeArgs(undefined), undefined);
});

test("sanitizeArgs caps depth to avoid stack overflow on cycles", () => {
  // Build a 20-level nested object — deeper than MAX_DEPTH.
  let deep: Record<string, unknown> = { leaf: 1 };
  for (let i = 0; i < 20; i++) deep = { nested: deep };

  const out = sanitizeArgs(deep) as Record<string, unknown>;
  // Walk down and confirm we hit the depth-truncation marker somewhere.
  let cursor: unknown = out;
  let foundMarker = false;
  for (let i = 0; i < 30; i++) {
    if (cursor === "[DEPTH_EXCEEDED]") {
      foundMarker = true;
      break;
    }
    if (typeof cursor !== "object" || cursor === null) break;
    cursor = (cursor as Record<string, unknown>).nested;
  }
  assert.equal(foundMarker, true, "depth-truncation marker should appear");
});

test("sanitizeArgs converts Date to ISO string", () => {
  const d = new Date("2026-04-20T10:00:00.000Z");
  assert.equal(sanitizeArgs(d), "2026-04-20T10:00:00.000Z");
});
