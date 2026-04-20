/**
 * Aggregator-Tests — reines Pure-Function-Testing.
 *
 * Deckt ab: Hybrid-Score-Normalisierung, Per-Source-Cap, Dedup,
 * Degradation-Info, Sort-Stabilität.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { aggregateResults } from "@/lib/mcp/tools/search/aggregate";
import type {
  ExternalSearchHit,
  ExternalSearchOutcome,
} from "@/lib/mcp/tools/search/external";
import type { InternalSearchHit } from "@/lib/mcp/tools/search/internal";

function internalHit(
  id: string,
  similarity: number,
  type: "note" | "file_chunk" = "note",
): InternalSearchHit {
  return {
    id,
    type,
    title: `Title ${id}`,
    snippet: `snippet ${id}`,
    similarity,
  };
}

function externalHit(
  id: string,
  rawScore: number,
  source = "confluence-cloud",
  sourceLabel = "Empro Confluence",
): ExternalSearchHit {
  return {
    id,
    source,
    sourceLabel,
    title: `Ext ${id}`,
    snippet: `ext-snippet ${id}`,
    url: `https://example.com/${id}`,
    rawScore,
    lokriSpaceId: "space-1",
    metadata: {},
  };
}

// ---------------------------------------------------------------------------
// Basics
// ---------------------------------------------------------------------------

test("aggregate: returns empty when all inputs empty", () => {
  const out = aggregateResults({
    internalHits: [],
    external: [],
    limit: 10,
  });
  assert.deepEqual(out.results, []);
  assert.deepEqual(out.degradedSources, []);
});

test("aggregate: internal-only is sort-stable and normalized", () => {
  const out = aggregateResults({
    internalHits: [
      internalHit("a", 0.8),
      internalHit("b", 0.6),
      internalHit("c", 0.9),
    ],
    external: [],
    limit: 10,
  });
  // Sorted by normalized score desc — since all are internal, the
  // order should follow similarity desc.
  assert.deepEqual(
    out.results.map((r) => r.id),
    ["c", "a", "b"],
  );
  // Best = 1.0, worst = 0.0 after min-max normalization.
  assert.equal(out.results[0].score, 1);
  assert.equal(out.results[out.results.length - 1].score, 0);
});

test("aggregate: external-only — per-source normalization", () => {
  const externalOk: ExternalSearchOutcome = {
    status: "ok",
    sourceLabel: "Empro",
    hits: [
      externalHit("confluence:1", 10),
      externalHit("confluence:2", 5),
      externalHit("confluence:3", 1),
    ],
  };
  const out = aggregateResults({
    internalHits: [],
    external: [externalOk],
    limit: 10,
  });
  assert.equal(out.results.length, 3);
  assert.equal(out.results[0].id, "confluence:1"); // highest raw
  assert.equal(out.results[0].score, 1);
  assert.equal(out.results[out.results.length - 1].score, 0);
});

// ---------------------------------------------------------------------------
// Per-Source-Cap
// ---------------------------------------------------------------------------

test("aggregate: caps each source at 20 hits before merge", () => {
  const big: InternalSearchHit[] = [];
  for (let i = 0; i < 50; i++) {
    big.push(internalHit(`n:${i}`, 0.5 + i * 0.01));
  }
  const out = aggregateResults({
    internalHits: big,
    external: [],
    limit: 100, // limit > cap
  });
  assert.equal(out.results.length, 20);
});

test("aggregate: external per-source cap applies independently", () => {
  const extA: ExternalSearchOutcome = {
    status: "ok",
    sourceLabel: "A",
    hits: Array.from({ length: 30 }, (_, i) =>
      externalHit(`confluence:a${i}`, 100 - i, "confluence-cloud", "A"),
    ),
  };
  const extB: ExternalSearchOutcome = {
    status: "ok",
    sourceLabel: "B",
    hits: Array.from({ length: 30 }, (_, i) =>
      externalHit(`slack:b${i}`, 100 - i, "slack", "B"),
    ),
  };
  const out = aggregateResults({
    internalHits: [],
    external: [extA, extB],
    limit: 100,
  });
  // 20 from A + 20 from B = 40
  assert.equal(out.results.length, 40);
});

// ---------------------------------------------------------------------------
// Degradation
// ---------------------------------------------------------------------------

test("aggregate: collects degradation reasons", () => {
  const outcomes: ExternalSearchOutcome[] = [
    {
      status: "ok",
      sourceLabel: "A",
      hits: [externalHit("confluence:1", 10)],
    },
    {
      status: "degraded",
      sourceLabel: "B",
      hits: [],
      reason: "Timeout after 5000ms",
    },
    {
      status: "failure",
      sourceLabel: "C",
      hits: [],
      reason: "PAT rejected",
    },
  ];
  const out = aggregateResults({
    internalHits: [],
    external: outcomes,
    limit: 10,
  });
  assert.equal(out.results.length, 1);
  assert.deepEqual(out.degradedSources, [
    { sourceLabel: "B", reason: "Timeout after 5000ms" },
    { sourceLabel: "C", reason: "PAT rejected" },
  ]);
});

// ---------------------------------------------------------------------------
// Dedup
// ---------------------------------------------------------------------------

test("aggregate: dedupes by id, keeping higher score", () => {
  const a: ExternalSearchOutcome = {
    status: "ok",
    sourceLabel: "A",
    hits: [externalHit("confluence:X", 5)],
  };
  const b: ExternalSearchOutcome = {
    status: "ok",
    sourceLabel: "B",
    hits: [externalHit("confluence:X", 10)],
  };
  const out = aggregateResults({
    internalHits: [],
    external: [a, b],
    limit: 10,
  });
  assert.equal(out.results.length, 1);
  // Higher raw score wins — both get normalized to 0.5 (single hit per
  // source), so effectively the second-inserted wins on tie.
  assert.equal(out.results[0].id, "confluence:X");
});

// ---------------------------------------------------------------------------
// Source marker
// ---------------------------------------------------------------------------

test("aggregate: internal hits carry source='lokri', external keep their marker", () => {
  const out = aggregateResults({
    internalHits: [internalHit("note-1", 0.9)],
    external: [
      {
        status: "ok",
        sourceLabel: "Empro",
        hits: [externalHit("confluence:1", 10)],
      },
    ],
    limit: 10,
  });
  const internal = out.results.find((r) => r.id === "note-1");
  const external = out.results.find((r) => r.id === "confluence:1");
  assert.equal(internal?.source, "lokri");
  assert.equal(external?.source, "confluence-cloud");
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

test("aggregate: degenerate case — single hit gets score 0.5 (no range)", () => {
  const out = aggregateResults({
    internalHits: [internalHit("a", 0.7)],
    external: [],
    limit: 10,
  });
  assert.equal(out.results[0].score, 0.5);
});

test("aggregate: all-same-score hits all get 0.5", () => {
  const out = aggregateResults({
    internalHits: [
      internalHit("a", 0.5),
      internalHit("b", 0.5),
      internalHit("c", 0.5),
    ],
    external: [],
    limit: 10,
  });
  for (const r of out.results) {
    assert.equal(r.score, 0.5);
  }
});

test("aggregate: respects limit cap across all sources", () => {
  const out = aggregateResults({
    internalHits: [
      internalHit("a", 0.9),
      internalHit("b", 0.8),
      internalHit("c", 0.7),
    ],
    external: [
      {
        status: "ok",
        sourceLabel: "X",
        hits: [
          externalHit("confluence:1", 10),
          externalHit("confluence:2", 8),
        ],
      },
    ],
    limit: 3,
  });
  assert.equal(out.results.length, 3);
});
