/**
 * `registerAllProviders()` — Boot-Hook-Test.
 *
 * Prüft nur die Idempotenz-Kontrakte, nicht die Registry-Internals
 * (die sind separat in `connectors-registry.test.ts` getestet).
 */

import assert from "node:assert/strict";
import test from "node:test";
import { __resetForTests, has, list } from "@/lib/connectors/registry";
import {
  __resetProvidersForTests,
  registerAllProviders,
} from "@/lib/connectors/providers/register";

test("registerAllProviders: registers confluence-cloud", () => {
  __resetForTests();
  __resetProvidersForTests();
  registerAllProviders();
  assert.equal(has("confluence-cloud"), true);
  assert.equal(list().length, 1);
});

test("registerAllProviders: is idempotent on repeated calls", () => {
  __resetForTests();
  __resetProvidersForTests();
  registerAllProviders();
  // Zweiter Call darf nicht throwen (Registry würde sonst bei Duplicate
  // meckern) — Flag muss abfangen.
  assert.doesNotThrow(() => registerAllProviders());
  assert.equal(list().length, 1);
});

test("registerAllProviders: respects registry reset when provider flag is also reset", () => {
  __resetForTests();
  __resetProvidersForTests();
  registerAllProviders();
  // Registry leeren, aber Flag stehen lassen: dann passiert beim
  // zweiten Call nichts (Flag says „already done"), und die Registry
  // bleibt leer — das ist beabsichtigt. Reale Prod-Szenarien resetten
  // nie nur eines von beiden.
  __resetForTests();
  registerAllProviders();
  assert.equal(list().length, 0);
  // Beides reset → Registrierung läuft wieder durch
  __resetProvidersForTests();
  registerAllProviders();
  assert.equal(list().length, 1);
});
