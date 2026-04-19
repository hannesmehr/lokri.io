import test from "node:test";
import assert from "node:assert/strict";
import { createUserSchema } from "@/lib/admin/create-user-schema";

/**
 * Contract-Tests für `POST /api/admin/users`.
 *
 * Wie bei `admin-guard.test.ts` gilt: die route-level-Behaviour
 * („Admin legt User mit Magic-Link an → User in DB, emailVerified=true")
 * braucht einen laufenden Postgres und wird manuell + über den
 * Dev-Server-Smoke-Test verifiziert. Diese Suite pinnt die Contract-
 * Shape der Zod-Validation, damit ein Refactor die akzeptierten/abge-
 * lehnten Eingaben nicht still kippt.
 *
 * Gepinnte Invarianten:
 *   1. Email ist Pflicht + muss RFC-mäßig valid sein
 *   2. Password bei `initial_password` ≥ 12 Zeichen
 *   3. Team-Rolle ist genau `admin | member | viewer` — kein `owner`
 *   4. Sprache ist `de | en | auto`, Default `de`
 *   5. `canCreateTeams` ist Bool, Default `true`
 *   6. Discriminated-Union: `setupMethod.type` ∈ { magic_link,
 *      initial_password }, beide mit/ohne Payload
 *   7. Fehlender oder leerer `team.accountId` wird abgelehnt (UUID)
 */

test("minimal valid payload — magic-link ohne name / team", () => {
  const parsed = createUserSchema.safeParse({
    email: "new@example.com",
    setupMethod: { type: "magic_link" },
  });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.email, "new@example.com");
  assert.equal(parsed.data.canCreateTeams, true, "Default true");
  assert.equal(parsed.data.preferredLocale, "de", "Default de");
  assert.equal(parsed.data.setupMethod.type, "magic_link");
  assert.equal(parsed.data.team, undefined);
});

test("initial-password payload — password ≥ 12 Zeichen accepted", () => {
  const parsed = createUserSchema.safeParse({
    email: "new@example.com",
    setupMethod: {
      type: "initial_password",
      password: "hunter2-plenty-bits",
    },
  });
  assert.equal(parsed.success, true);
});

test("initial-password payload — password < 12 Zeichen rejected", () => {
  const parsed = createUserSchema.safeParse({
    email: "new@example.com",
    setupMethod: { type: "initial_password", password: "short" },
  });
  assert.equal(parsed.success, false);
  if (parsed.success) return;
  const flat = parsed.error.flatten();
  // Zod v4 legt den Fehler unter `fieldErrors.setupMethod` ab
  // (discriminated-union rendert den inneren Fehler dort).
  const joined = JSON.stringify(flat);
  assert.ok(
    /password|min|12/i.test(joined),
    `expected min-length error, got: ${joined}`,
  );
});

test("invalid email rejected", () => {
  const parsed = createUserSchema.safeParse({
    email: "not-an-email",
    setupMethod: { type: "magic_link" },
  });
  assert.equal(parsed.success, false);
});

test("missing email rejected", () => {
  const parsed = createUserSchema.safeParse({
    setupMethod: { type: "magic_link" },
  });
  assert.equal(parsed.success, false);
});

test("team-rolle owner im create-flow abgelehnt", () => {
  const parsed = createUserSchema.safeParse({
    email: "new@example.com",
    setupMethod: { type: "magic_link" },
    team: {
      accountId: "00000000-0000-4000-8000-000000000001",
      role: "owner",
    },
  });
  assert.equal(
    parsed.success,
    false,
    "owner ist nur via Ownership-Transfer, nicht Create",
  );
});

test("team-rolle admin akzeptiert", () => {
  const parsed = createUserSchema.safeParse({
    email: "new@example.com",
    setupMethod: { type: "magic_link" },
    team: {
      accountId: "00000000-0000-4000-8000-000000000001",
      role: "admin",
    },
  });
  assert.equal(parsed.success, true);
});

test("team-rolle member + viewer akzeptiert", () => {
  for (const role of ["member", "viewer"] as const) {
    const parsed = createUserSchema.safeParse({
      email: "new@example.com",
      setupMethod: { type: "magic_link" },
      team: {
        accountId: "00000000-0000-4000-8000-000000000001",
        role,
      },
    });
    assert.equal(parsed.success, true, `role ${role} should be accepted`);
  }
});

test("team.accountId muss UUID sein — random string abgelehnt", () => {
  const parsed = createUserSchema.safeParse({
    email: "new@example.com",
    setupMethod: { type: "magic_link" },
    team: { accountId: "not-a-uuid", role: "member" },
  });
  assert.equal(parsed.success, false);
});

test("locale = auto akzeptiert, mappt zu 'auto' (Route mappt auf null in DB)", () => {
  const parsed = createUserSchema.safeParse({
    email: "new@example.com",
    preferredLocale: "auto",
    setupMethod: { type: "magic_link" },
  });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.preferredLocale, "auto");
});

test("locale unbekannter Wert abgelehnt", () => {
  const parsed = createUserSchema.safeParse({
    email: "new@example.com",
    preferredLocale: "fr",
    setupMethod: { type: "magic_link" },
  });
  assert.equal(parsed.success, false);
});

test("canCreateTeams = false wird respektiert (nicht vom Default überschrieben)", () => {
  const parsed = createUserSchema.safeParse({
    email: "new@example.com",
    canCreateTeams: false,
    setupMethod: { type: "magic_link" },
  });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.canCreateTeams, false);
});

test("name optional — undefined akzeptiert, leerer String wird zum leeren String (Route mapped auf local-part)", () => {
  const parsed = createUserSchema.safeParse({
    email: "new@example.com",
    name: "",
    setupMethod: { type: "magic_link" },
  });
  // Leerer String ist valid bei der Zod-Shape — die Route trimmt + fällt
  // auf local-part der Email zurück. Das ist eine bewusste Toleranz für
  // den UI-Controlled-Input, der immer `""` statt `undefined` sendet.
  assert.equal(parsed.success, true);
});

test("setupMethod fehlender `type` — discriminated union greift", () => {
  const parsed = createUserSchema.safeParse({
    email: "new@example.com",
    setupMethod: {
      password: "hunter2-plenty-bits",
    } as unknown as { type: "magic_link" },
  });
  assert.equal(parsed.success, false);
});

test("setupMethod unbekannter `type` abgelehnt", () => {
  const parsed = createUserSchema.safeParse({
    email: "new@example.com",
    setupMethod: { type: "oauth_magic" as unknown as "magic_link" },
  });
  assert.equal(parsed.success, false);
});
