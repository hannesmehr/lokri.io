import assert from "node:assert/strict";
import test from "node:test";
import {
  sanitizeArgs,
  scrubSecretValues,
} from "@/lib/connectors/sanitize";

// Realistische Token-Fixtures. Jeder Wert ist lang genug für den
// entsprechenden Regex-Schwellenwert.
const BEARER_TOKEN = `Bearer ${"a".repeat(32)}`;
const LOKRI_TOKEN = `lk_${"abcd1234".repeat(3)}`; // 24 chars nach prefix
const ATLASSIAN_TOKEN = `ATATT${"X".repeat(150)}`;
const GITHUB_TOKEN = `ghp_${"A".repeat(40)}`;
const SLACK_TOKEN = `xoxb-${"A".repeat(20)}-abcdef`;
const JWT_TOKEN =
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abcDEFghiJKL-mno_";
const AWS_KEY = "AKIAABCDEFGHIJKLMNOP";
const OPENAI_KEY = `sk-${"a".repeat(40)}`;

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

// ---------------------------------------------------------------------------
// Ebene 2: Value-Pattern-Scrubbing
// ---------------------------------------------------------------------------

test("value-scrub: Bearer in Freitext wird zu <redacted:bearer>", () => {
  const out = sanitizeArgs({
    query: `check this out: ${BEARER_TOKEN} — for auth`,
  });
  assert.deepEqual(out, {
    query: "check this out: <redacted:bearer> — for auth",
  });
});

test("value-scrub: lk_-Token in Array-Element", () => {
  const out = sanitizeArgs({
    tags: ["foo", LOKRI_TOKEN, "bar"],
  });
  assert.deepEqual(out, {
    tags: ["foo", "<redacted:lokri>", "bar"],
  });
});

test("value-scrub: Atlassian-Token in verschachteltem Object, harmloser Key", () => {
  const out = sanitizeArgs({
    meta: { nested: { note: `old: ${ATLASSIAN_TOKEN} rotated` } },
  });
  // Input-Struktur erhalten, nur Token durch Marker ersetzt
  const resolved = (((out as Record<string, unknown>).meta as Record<string, unknown>)
    .nested as Record<string, unknown>).note;
  assert.equal(resolved, "old: <redacted:atlassian> rotated");
});

test("value-scrub: GitHub-Token (ghp, gho, ghu, ghs, ghr alle Varianten)", () => {
  for (const prefix of ["ghp", "gho", "ghu", "ghs", "ghr"]) {
    const token = `${prefix}_${"A".repeat(40)}`;
    const out = sanitizeArgs({ note: `deployed via ${token} on Tuesday` });
    assert.deepEqual(out, { note: "deployed via <redacted:github> on Tuesday" });
  }
});

test("value-scrub: Slack xoxb-Token", () => {
  const out = sanitizeArgs({ integration: SLACK_TOKEN });
  assert.deepEqual(out, { integration: "<redacted:slack>" });
});

test("value-scrub: JWT drei-Segment-Pattern", () => {
  const out = sanitizeArgs({ payload: JWT_TOKEN });
  assert.deepEqual(out, { payload: "<redacted:jwt>" });
});

test("value-scrub: AWS Access Key", () => {
  const out = sanitizeArgs({ config: AWS_KEY });
  assert.deepEqual(out, { config: "<redacted:aws>" });
});

test("value-scrub: OpenAI sk- key", () => {
  const out = sanitizeArgs({ key: OPENAI_KEY });
  // Key ist "key", nicht in SECRET_KEYS → key-redact greift nicht →
  // value-scrub muss den sk- pattern fangen.
  assert.deepEqual(out, { key: "<redacted:openai>" });
});

test("value-scrub: harmlose Strings mit dem Wort 'bearer' bleiben unverändert", () => {
  // Kein echter Token dahinter — Regex verlangt mind. 16 Token-Chars
  // nach `Bearer `.
  const out = sanitizeArgs({
    query: "how does bearer authentication work in REST APIs",
  });
  assert.deepEqual(out, {
    query: "how does bearer authentication work in REST APIs",
  });
});

test("value-scrub: UUIDs und lange Hashes bleiben unverändert (kein generic-long)", () => {
  const uuid = "0193d01a-aaaa-7000-bbbb-000000000001";
  const sha256 = "a".repeat(64); // 64-char hex
  const out = sanitizeArgs({ space_id: uuid, hash: sha256 });
  assert.deepEqual(out, { space_id: uuid, hash: sha256 });
});

test("value-scrub: nicht-mittendrin — Token in 'myATATT…' nicht matcht (Word-Boundary)", () => {
  // Kein Word-Boundary vor ATATT wenn ein Wort-Char davor steht.
  const glued = `my${ATLASSIAN_TOKEN}`;
  const out = sanitizeArgs({ note: glued });
  // Der ATATT-Regex hat \b am Anfang → match fällt weg, weil 'y' vor
  // 'A' kein Word-Boundary ist.
  assert.deepEqual(out, { note: glued });
});

test("value-scrub: mehrere Tokens in einem String werden alle redacted", () => {
  const mixed = `got ${GITHUB_TOKEN} and ${LOKRI_TOKEN} — both live`;
  const out = sanitizeArgs({ note: mixed });
  assert.deepEqual(out, {
    note: "got <redacted:github> and <redacted:lokri> — both live",
  });
});

test("value-scrub: Key-Redact gewinnt über Value-Scrub bei Kollision", () => {
  // Key `token` ist im SECRET_KEYS-Set → der ganze Wert wird [REDACTED],
  // nicht `<redacted:…>`. Value-Scrub liefe nicht auf diesen Wert.
  const out = sanitizeArgs({ token: LOKRI_TOKEN });
  assert.deepEqual(out, { token: "[REDACTED]" });
});

test("value-scrub: deep-walk in Array-of-Objects funktioniert", () => {
  const out = sanitizeArgs({
    items: [
      { desc: `first ${GITHUB_TOKEN}` },
      { desc: "no token here" },
      { desc: JWT_TOKEN },
    ],
  });
  const items = (out as { items: Array<{ desc: string }> }).items;
  assert.equal(items[0].desc, "first <redacted:github>");
  assert.equal(items[1].desc, "no token here");
  assert.equal(items[2].desc, "<redacted:jwt>");
});

// ---------------------------------------------------------------------------
// scrubSecretValues — direkt
// ---------------------------------------------------------------------------

test("scrubSecretValues: top-level string API", () => {
  assert.equal(scrubSecretValues("plain text"), "plain text");
  assert.equal(
    scrubSecretValues(`with ${OPENAI_KEY} inline`),
    "with <redacted:openai> inline",
  );
});
