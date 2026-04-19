import test from "node:test";
import assert from "node:assert/strict";
import {
  KNOWN_PLAN_IDS,
  createAccountSchema,
} from "@/lib/admin/create-account-schema";

/**
 * Contract-Tests für `POST /api/admin/accounts`.
 *
 * Wie bei `admin-user-create.test.ts` + `admin-guard.test.ts`: die
 * Route-Logik (Transaktion, Audit, Quota-Row-Seed) braucht Postgres und
 * läuft über manuellen Smoke-Test. Hier pinnen wir die Zod-Shape, damit
 * ein Refactor die akzeptierten/abgelehnten Eingaben nicht still kippt.
 *
 * Gepinnte Invarianten:
 *   1. Name ist Pflicht + min 1 Zeichen + max 120
 *   2. Plan muss aus `KNOWN_PLAN_IDS`-Whitelist stammen
 *   3. Owner-ID ist optional; wenn gesetzt, muss sie UUID sein
 *   4. Quota-Override ist optional; Felder sind non-negative Integers,
 *      `null`-Werte erlaubt
 *   5. Quota-Override mit Extra-Feldern wird abgelehnt (`.strict()`)
 */

test("minimal valid payload — nur name + plan", () => {
  const parsed = createAccountSchema.safeParse({
    name: "Acme Team",
    planId: "team",
  });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.name, "Acme Team");
  assert.equal(parsed.data.planId, "team");
  assert.equal(parsed.data.ownerUserId, undefined);
  assert.equal(parsed.data.quotaOverride, undefined);
});

test("name wird getrimmt", () => {
  const parsed = createAccountSchema.safeParse({
    name: "   Acme Team   ",
    planId: "team",
  });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.name, "Acme Team");
});

test("leerer name abgelehnt", () => {
  const parsed = createAccountSchema.safeParse({
    name: "   ",
    planId: "team",
  });
  assert.equal(parsed.success, false);
});

test("zu langer name (> 120) abgelehnt", () => {
  const parsed = createAccountSchema.safeParse({
    name: "a".repeat(121),
    planId: "team",
  });
  assert.equal(parsed.success, false);
});

test("name genau 120 Zeichen akzeptiert", () => {
  const parsed = createAccountSchema.safeParse({
    name: "a".repeat(120),
    planId: "team",
  });
  assert.equal(parsed.success, true);
});

test("Plan-Whitelist — bekannte IDs akzeptiert", () => {
  for (const id of KNOWN_PLAN_IDS) {
    const parsed = createAccountSchema.safeParse({
      name: "Acme",
      planId: id,
    });
    assert.equal(parsed.success, true, `plan ${id} should be accepted`);
  }
});

test("unbekannter Plan abgelehnt", () => {
  const parsed = createAccountSchema.safeParse({
    name: "Acme",
    planId: "enterprise-ultra",
  });
  assert.equal(parsed.success, false);
});

test("Plan fehlt → abgelehnt", () => {
  const parsed = createAccountSchema.safeParse({ name: "Acme" });
  assert.equal(parsed.success, false);
});

test("ownerUserId: UUID akzeptiert", () => {
  const parsed = createAccountSchema.safeParse({
    name: "Acme",
    planId: "team",
    ownerUserId: "00000000-0000-4000-8000-000000000001",
  });
  assert.equal(parsed.success, true);
});

test("ownerUserId: Nicht-UUID abgelehnt", () => {
  const parsed = createAccountSchema.safeParse({
    name: "Acme",
    planId: "team",
    ownerUserId: "not-a-uuid",
  });
  assert.equal(parsed.success, false);
});

test("ownerUserId: undefined erlaubt (orphaned-Account)", () => {
  const parsed = createAccountSchema.safeParse({
    name: "Acme",
    planId: "team",
  });
  assert.equal(parsed.success, true);
});

test("quotaOverride: leeres Objekt akzeptiert (alle Felder optional)", () => {
  const parsed = createAccountSchema.safeParse({
    name: "Acme",
    planId: "team",
    quotaOverride: {},
  });
  assert.equal(parsed.success, true);
});

test("quotaOverride: bytes/files/notes als Zahlen", () => {
  const parsed = createAccountSchema.safeParse({
    name: "Acme",
    planId: "team",
    quotaOverride: {
      bytes: 1_000_000_000,
      files: 5000,
      notes: 10000,
    },
  });
  assert.equal(parsed.success, true);
});

test("quotaOverride: negative Werte abgelehnt", () => {
  const parsed = createAccountSchema.safeParse({
    name: "Acme",
    planId: "team",
    quotaOverride: { bytes: -1 },
  });
  assert.equal(parsed.success, false);
});

test("quotaOverride: Nicht-Integer abgelehnt (1.5)", () => {
  const parsed = createAccountSchema.safeParse({
    name: "Acme",
    planId: "team",
    quotaOverride: { files: 1.5 },
  });
  assert.equal(parsed.success, false);
});

test("quotaOverride: null-Werte erlaubt (= Plan-Default)", () => {
  const parsed = createAccountSchema.safeParse({
    name: "Acme",
    planId: "team",
    quotaOverride: { bytes: null, files: null, notes: null },
  });
  assert.equal(parsed.success, true);
});

test("quotaOverride: unbekannte Felder abgelehnt (strict)", () => {
  const parsed = createAccountSchema.safeParse({
    name: "Acme",
    planId: "team",
    quotaOverride: { seats: 10 },
  });
  assert.equal(
    parsed.success,
    false,
    "seats ist kein erlaubtes Override-Feld (Seats = Member-Count)",
  );
});

test("kombiniert: alle Felder gesetzt", () => {
  const parsed = createAccountSchema.safeParse({
    name: "Acme Team",
    planId: "team",
    ownerUserId: "00000000-0000-4000-8000-000000000001",
    quotaOverride: {
      bytes: 10_737_418_240,
      files: 5000,
    },
  });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.name, "Acme Team");
  assert.equal(parsed.data.planId, "team");
  assert.equal(parsed.data.ownerUserId, "00000000-0000-4000-8000-000000000001");
  assert.deepEqual(parsed.data.quotaOverride, {
    bytes: 10_737_418_240,
    files: 5000,
  });
});

test("Plan-IDs sind identisch mit der erwarteten Whitelist aus seed.ts", () => {
  // Contract-Pin: wenn jemand die KNOWN_PLAN_IDS ändert, muss
  // `lib/db/seed.ts` synchron bleiben (siehe Kommentar im Schema-
  // Modul). Dieser Test ist der Tripwire.
  assert.deepEqual(
    [...KNOWN_PLAN_IDS].sort(),
    ["business", "free", "pro", "starter", "team"],
  );
});
