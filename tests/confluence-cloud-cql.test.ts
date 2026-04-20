/**
 * CQL-Builder-Tests.
 *
 * Inkl. Empro-realer Space-Keys (`KnowHow`, `intern`) und klassischen
 * Injection-Versuchen. Ziel: keine unescaped User-Inputs in der CQL.
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSearchCql,
  CqlBuilderError,
  escapeCqlIdentifier,
  escapeCqlString,
} from "@/lib/connectors/providers/confluence-cloud/cql";

// ---------------------------------------------------------------------------
// Escape helpers
// ---------------------------------------------------------------------------

test("escapeCqlString: passes through plain text unchanged", () => {
  assert.equal(escapeCqlString("lokri architecture"), "lokri architecture");
});

test("escapeCqlString: escapes double quotes", () => {
  assert.equal(escapeCqlString('say "hello"'), 'say \\"hello\\"');
});

test("escapeCqlString: escapes backslash before quote (correct order)", () => {
  // Input:  back\slash with "quote"
  // Expected: back\\slash with \"quote\"
  const input = 'back\\slash with "quote"';
  const out = escapeCqlString(input);
  assert.equal(out, 'back\\\\slash with \\"quote\\"');
});

test("escapeCqlString: double-escape regression guard", () => {
  // Wenn man quote zuerst ersetzt, würde der eingefügte Backslash
  // danach verdoppelt. Der Test belegt: genau 2x \ vor " erwartet,
  // nicht 4x.
  const out = escapeCqlString('"');
  assert.equal(out, '\\"');
});

test("escapeCqlIdentifier: handles Empro-style keys with mixed case", () => {
  assert.equal(escapeCqlIdentifier("KnowHow"), "KnowHow");
  assert.equal(escapeCqlIdentifier("intern"), "intern");
});

// ---------------------------------------------------------------------------
// buildSearchCql
// ---------------------------------------------------------------------------

test("buildSearchCql: single space, simple query", () => {
  const cql = buildSearchCql({ query: "lokri", spaceKeys: ["ENG"] });
  assert.equal(
    cql,
    'type = "page" AND space IN ("ENG") AND text ~ "lokri"',
  );
});

test("buildSearchCql: multi-space list", () => {
  const cql = buildSearchCql({
    query: "deploy",
    spaceKeys: ["ENG", "PROD", "OPS"],
  });
  assert.equal(
    cql,
    'type = "page" AND space IN ("ENG", "PROD", "OPS") AND text ~ "deploy"',
  );
});

test("buildSearchCql: Empro keys (KnowHow, intern) are quoted correctly", () => {
  const cql = buildSearchCql({
    query: "ferien",
    spaceKeys: ["KnowHow", "intern"],
  });
  // Keys werden in Quotes gewrappt, Leerzeichen in Keys wären auch ok
  assert.equal(
    cql,
    'type = "page" AND space IN ("KnowHow", "intern") AND text ~ "ferien"',
  );
});

test("buildSearchCql: escapes quotes in user query (injection guard)", () => {
  // Klassischer Injection-Versuch: User query enthält `"`,
  // das die Quote der text-Filter schliessen würde.
  const cql = buildSearchCql({
    query: 'foo" OR space = "SECRET" AND text ~ "bar',
    spaceKeys: ["ENG"],
  });
  // Die User-Quotes müssen escaped sein, damit CQL das als
  // Literal liest, nicht als Struktur.
  assert.match(cql, /text ~ "foo\\" OR space = \\"SECRET\\" AND text ~ \\"bar"/);
  // Plus: der Output enthält KEINEN unescaped `"` mitten im Text-Filter
  // (genau zwei Quotes für text ~ "...")
  const textFilterMatch = /text ~ "((?:[^"\\]|\\.)*)"/.exec(cql);
  assert.ok(textFilterMatch, "text filter must parse as a single quoted string");
});

test("buildSearchCql: escapes quotes in space keys (exotic, defensive)", () => {
  const cql = buildSearchCql({
    query: "x",
    spaceKeys: ['weird"key'],
  });
  assert.match(cql, /space IN \("weird\\"key"\)/);
});

test("buildSearchCql: escapes backslash in user query", () => {
  const cql = buildSearchCql({
    query: "path\\to\\file",
    spaceKeys: ["ENG"],
  });
  assert.match(cql, /text ~ "path\\\\to\\\\file"/);
});

test("buildSearchCql: throws on empty space list", () => {
  assert.throws(
    () => buildSearchCql({ query: "x", spaceKeys: [] }),
    (err) => err instanceof CqlBuilderError,
  );
});
