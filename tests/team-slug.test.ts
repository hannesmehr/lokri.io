/**
 * Pure-function tests for `lib/teams/slug.ts` — slug generation + collision
 * resolution. DB-touching paths (the actual INSERT in `createTeam`, the
 * backfill migration) are covered by deployment smoke-tests, not here.
 *
 * The shape of the slug algorithm is the **contract** the
 * `/api/mcp/team/[slug]` route depends on. If any of these tests change,
 * the migration's backfill logic (`drizzle/0020_owner_accounts_slug.sql`)
 * needs to change in lockstep — the two implementations must produce the
 * same slugs for the same names.
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  RESERVED_SLUGS,
  ensureUniqueSlug,
  slugifyOwnerAccountName,
} from "@/lib/teams/slug";

// ---------------------------------------------------------------------------
// slugifyOwnerAccountName
// ---------------------------------------------------------------------------

test("slugifyOwnerAccountName — basic lowercase + hyphen", () => {
  assert.equal(slugifyOwnerAccountName("Empro"), "empro");
  assert.equal(slugifyOwnerAccountName("Axel Springer"), "axel-springer");
  assert.equal(slugifyOwnerAccountName("HANNES MEHR"), "hannes-mehr");
});

test("slugifyOwnerAccountName — collapses multiple hyphens", () => {
  assert.equal(slugifyOwnerAccountName("foo   bar___baz"), "foo-bar-baz");
  assert.equal(slugifyOwnerAccountName("a - - b"), "a-b");
});

test("slugifyOwnerAccountName — strips leading/trailing hyphens", () => {
  assert.equal(slugifyOwnerAccountName("!hello!"), "hello");
  assert.equal(slugifyOwnerAccountName("  spaced  "), "spaced");
  // "team" is deliberately NOT in RESERVED_SLUGS — it's used as fallback
  // prefix; a literal team named "Team" resolves to slug=team without
  // suffixing.
  assert.equal(slugifyOwnerAccountName("Team"), "team");
});

test("slugifyOwnerAccountName — NFKD strips diacritics", () => {
  assert.equal(slugifyOwnerAccountName("Müller"), "muller");
  assert.equal(slugifyOwnerAccountName("café"), "cafe");
  assert.equal(slugifyOwnerAccountName("Señor Niño"), "senor-nino");
});

test("slugifyOwnerAccountName — empty/too-short falls back to prefix", () => {
  assert.equal(slugifyOwnerAccountName(""), "account");
  assert.equal(slugifyOwnerAccountName("!!!"), "account");
  assert.equal(slugifyOwnerAccountName("a"), "account"); // <2 chars
  assert.equal(slugifyOwnerAccountName("!!!", "team"), "team");
  assert.equal(slugifyOwnerAccountName("", "user"), "user");
});

test("slugifyOwnerAccountName — truncates at max 60 chars, prefers word boundary", () => {
  const long =
    "this-is-a-very-long-team-name-that-will-definitely-exceed-the-sixty-character-limit";
  const result = slugifyOwnerAccountName(long);
  assert.ok(result.length <= 60, `got length ${result.length}: "${result}"`);
  // Should have truncated at a hyphen, not mid-word.
  assert.ok(
    !result.endsWith("-"),
    `expected no trailing hyphen on truncation: "${result}"`,
  );
  // The prefix should be preserved.
  assert.ok(
    result.startsWith("this-is-a-very"),
    `expected prefix preserved: "${result}"`,
  );
});

test("slugifyOwnerAccountName — reserved slugs get -team suffix", () => {
  // Sanity-check the set has the ones we're testing.
  assert.ok(RESERVED_SLUGS.has("api"));
  assert.ok(RESERVED_SLUGS.has("admin"));
  assert.ok(RESERVED_SLUGS.has("mcp"));

  assert.equal(slugifyOwnerAccountName("api"), "api-team");
  assert.equal(slugifyOwnerAccountName("ADMIN"), "admin-team");
  assert.equal(slugifyOwnerAccountName("mcp"), "mcp-team");
  // But a reserved-adjacent name is fine.
  assert.equal(slugifyOwnerAccountName("apitools"), "apitools");
  assert.equal(slugifyOwnerAccountName("admin-panel"), "admin-panel");
});

test("slugifyOwnerAccountName — digits and mixed alnum pass through", () => {
  assert.equal(slugifyOwnerAccountName("Team 2026"), "team-2026");
  assert.equal(slugifyOwnerAccountName("v2.0"), "v2-0");
  assert.equal(slugifyOwnerAccountName("42"), "42");
});

// ---------------------------------------------------------------------------
// ensureUniqueSlug
// ---------------------------------------------------------------------------

test("ensureUniqueSlug — returns base when free", async () => {
  const taken = new Set<string>();
  const result = await ensureUniqueSlug("empro", async (c) => taken.has(c));
  assert.equal(result, "empro");
});

test("ensureUniqueSlug — appends -2 on first collision", async () => {
  const taken = new Set(["empro"]);
  const result = await ensureUniqueSlug("empro", async (c) => taken.has(c));
  assert.equal(result, "empro-2");
});

test("ensureUniqueSlug — walks suffixes until free", async () => {
  const taken = new Set(["foo", "foo-2", "foo-3", "foo-4"]);
  const result = await ensureUniqueSlug("foo", async (c) => taken.has(c));
  assert.equal(result, "foo-5");
});

test("ensureUniqueSlug — truncates base to keep suffix in length budget", async () => {
  // 60-char base, all taken — suffix `-99` leaves 57 chars of base.
  const longBase = "a".repeat(60);
  const taken = new Set<string>();
  taken.add(longBase);
  const result = await ensureUniqueSlug(
    longBase,
    async (c) => taken.has(c),
  );
  // Expect `aaaa…a-2` with total length ≤ 60.
  assert.ok(result.length <= 60, `got length ${result.length}`);
  assert.ok(result.endsWith("-2"));
  assert.ok(result.startsWith("a"));
});

test("ensureUniqueSlug — throws after maxAttempts", async () => {
  // All slugs are taken — should hit the 5-attempt cap and throw.
  await assert.rejects(
    () =>
      ensureUniqueSlug("foo", async () => true, 5),
    /no free slug/,
  );
});

test("ensureUniqueSlug — counts DB lookups (no wasted calls)", async () => {
  let calls = 0;
  const taken = new Set(["foo", "foo-2"]);
  const result = await ensureUniqueSlug("foo", async (c) => {
    calls++;
    return taken.has(c);
  });
  assert.equal(result, "foo-3");
  // base + -2 + -3 = 3 lookups.
  assert.equal(calls, 3);
});
