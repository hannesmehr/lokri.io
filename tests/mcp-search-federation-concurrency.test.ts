/**
 * Concurrency-Limit-Tests für die Unified-Search-Federation.
 *
 * `withConcurrencyLimit` ist der Helper, den `runUnifiedSearch` nutzt,
 * um externe Calls auf `EXTERNAL_SEARCH_CONCURRENCY = 4` zu begrenzen.
 * Ohne Limit würde ein Team mit 20 gemappten Spaces 20 Upstream-Calls
 * parallel auslösen — Rate-Limit-Risiko, `maxDuration`-Überschreitung.
 *
 * Abort-Semantik auf externalSearch-Ebene ist separat abgedeckt in
 * `mcp-search-external.test.ts` (Signal-Passthrough, signal.aborted →
 * degraded-Outcome). Der Top-Level-Runner `runUnifiedSearch` selbst
 * importiert DB-gebundene Helper und wird daher E2E getestet.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { withConcurrencyLimit } from "@/lib/mcp/tools/search/concurrency";

// ---------------------------------------------------------------------------
// withConcurrencyLimit-Verhalten
// ---------------------------------------------------------------------------

test("concurrency-limit: caps parallel workers at limit (20 sources, limit 4)", async () => {
  let current = 0;
  let peak = 0;
  const sources = Array.from({ length: 20 }, (_, i) => i);
  const results = await withConcurrencyLimit(sources, 4, async (n) => {
    current++;
    peak = Math.max(peak, current);
    await new Promise((r) => setTimeout(r, 20));
    current--;
    return n * 2;
  });
  assert.equal(results.length, 20);
  assert.ok(peak <= 4, `peak should be <= 4, was ${peak}`);
  assert.ok(peak >= 2, `peak should be >= 2 (actually parallel), was ${peak}`);
  for (let i = 0; i < 20; i++) {
    assert.equal(results[i].status, "fulfilled");
    if (results[i].status === "fulfilled") {
      assert.equal(
        (results[i] as PromiseFulfilledResult<number>).value,
        i * 2,
      );
    }
  }
});

test("concurrency-limit: 3 items with limit 4 — all run in parallel", async () => {
  let current = 0;
  let peak = 0;
  const results = await withConcurrencyLimit([1, 2, 3], 4, async (n) => {
    current++;
    peak = Math.max(peak, current);
    await new Promise((r) => setTimeout(r, 20));
    current--;
    return n;
  });
  assert.equal(results.length, 3);
  // Alle 3 sollen parallel laufen — peak genau 3.
  assert.equal(peak, 3);
});

test("concurrency-limit: rejected workers wrapped as rejected (don't crash loop)", async () => {
  const results = await withConcurrencyLimit(
    [1, 2, 3, 4],
    2,
    async (n) => {
      if (n === 2) throw new Error("synthetic");
      return n;
    },
  );
  assert.equal(results.length, 4);
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].status, "rejected");
  assert.equal(results[2].status, "fulfilled");
  assert.equal(results[3].status, "fulfilled");
});

test("concurrency-limit: preserves order in result array", async () => {
  // Result-Index = Input-Index, auch bei parallelen Workern mit
  // unterschiedlichen Runtimes.
  const results = await withConcurrencyLimit(
    [100, 50, 20, 5, 30],
    3,
    async (ms) => {
      await new Promise((r) => setTimeout(r, ms));
      return ms;
    },
  );
  for (let i = 0; i < results.length; i++) {
    assert.equal(results[i].status, "fulfilled");
    if (results[i].status === "fulfilled") {
      assert.equal(
        (results[i] as PromiseFulfilledResult<number>).value,
        [100, 50, 20, 5, 30][i],
      );
    }
  }
});

test("concurrency-limit: empty input returns empty array, no workers spawned", async () => {
  let spawns = 0;
  const results = await withConcurrencyLimit([], 4, async () => {
    spawns++;
    return 1;
  });
  assert.deepEqual(results, []);
  assert.equal(spawns, 0);
});

test("concurrency-limit: limit > items behaves like unbounded parallel", async () => {
  let current = 0;
  let peak = 0;
  const results = await withConcurrencyLimit(
    [1, 2],
    10,
    async (n) => {
      current++;
      peak = Math.max(peak, current);
      await new Promise((r) => setTimeout(r, 10));
      current--;
      return n;
    },
  );
  assert.equal(results.length, 2);
  assert.equal(peak, 2);
});
