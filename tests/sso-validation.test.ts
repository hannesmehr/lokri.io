import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeIdTokenClaims,
  domainMatchesTeamConfig,
  extractEmailDomain,
  extractEntraClaims,
  validateSsoTokenClaims,
} from "@/lib/auth/sso-validation";

/**
 * Contract-Tests für die reinen SSO-Validierungs-Funktionen.
 *
 * DB-abhängige Funktionen (findSsoTeamForEmail, isUserTeamMember,
 * hasFallbackAdmin, upsertSsoIdentity, persist/consumeSsoState) werden
 * wie die admin-Routes manuell + via Dev-Server-Smoke-Test verifiziert
 * (siehe `docs/SSO_SETUP.md`). Das passt zu `admin-guard.test.ts` und
 * `admin-user-create.test.ts` — wir pinnen die Invarianten, die ohne
 * Postgres testbar sind.
 */

// ── extractEmailDomain ─────────────────────────────────────────────────

test("extractEmailDomain — typische Firma-Email", () => {
  assert.equal(extractEmailDomain("user@firma.de"), "firma.de");
});

test("extractEmailDomain — normalisiert case + trimmt whitespace", () => {
  assert.equal(extractEmailDomain("  User@FIRMA.DE  "), "firma.de");
});

test("extractEmailDomain — Subdomain", () => {
  assert.equal(extractEmailDomain("alice@sub.firma.de"), "sub.firma.de");
});

test("extractEmailDomain — ungültige Inputs geben null", () => {
  for (const bad of [
    "nicht-email",
    "@firma.de",
    "user@",
    "user@.de",
    "user@firma",
    "user @firma.de",
    "",
  ]) {
    assert.equal(
      extractEmailDomain(bad),
      null,
      `expected null for ${JSON.stringify(bad)}`,
    );
  }
});

// ── domainMatchesTeamConfig ────────────────────────────────────────────

test("domainMatchesTeamConfig — exakter Match", () => {
  assert.equal(
    domainMatchesTeamConfig("user@firma.de", ["firma.de"]),
    true,
  );
});

test("domainMatchesTeamConfig — case-insensitive in beide Richtungen", () => {
  assert.equal(
    domainMatchesTeamConfig("USER@Firma.De", ["FIRMA.DE"]),
    true,
  );
});

test("domainMatchesTeamConfig — mehrere erlaubte Domains", () => {
  assert.equal(
    domainMatchesTeamConfig("user@firma.com", ["firma.de", "firma.com"]),
    true,
  );
});

test("domainMatchesTeamConfig — Subdomain wird NICHT als Match erkannt", () => {
  // Bewusst: Subdomain-Matching wäre Feature, nicht Bug. Phase-1-
  // Default ist strikt, damit Config-Regeln explizit bleiben.
  assert.equal(
    domainMatchesTeamConfig("user@mail.firma.de", ["firma.de"]),
    false,
  );
});

test("domainMatchesTeamConfig — leere Domain-Liste matcht nichts", () => {
  assert.equal(domainMatchesTeamConfig("user@firma.de", []), false);
});

test("domainMatchesTeamConfig — ungültige Email matcht nichts", () => {
  assert.equal(domainMatchesTeamConfig("nicht-email", ["firma.de"]), false);
});

// ── validateSsoTokenClaims ─────────────────────────────────────────────

const CFG = {
  tenantId: "tenant-abc",
  allowedDomains: ["firma.de"],
  enabled: true,
};

test("validateSsoTokenClaims — alles stimmt → null", () => {
  assert.equal(
    validateSsoTokenClaims({
      tokenTid: "tenant-abc",
      tokenEmail: "user@firma.de",
      config: CFG,
    }),
    null,
  );
});

test("validateSsoTokenClaims — disabled team → configurationError", () => {
  assert.equal(
    validateSsoTokenClaims({
      tokenTid: "tenant-abc",
      tokenEmail: "user@firma.de",
      config: { ...CFG, enabled: false },
    }),
    "sso.configurationError",
  );
});

test("validateSsoTokenClaims — Tenant-ID stimmt nicht → tenantMismatch", () => {
  assert.equal(
    validateSsoTokenClaims({
      tokenTid: "tenant-evil",
      tokenEmail: "user@firma.de",
      config: CFG,
    }),
    "sso.tenantMismatch",
  );
});

test("validateSsoTokenClaims — Email-Domain nicht erlaubt → domainNotAllowed", () => {
  assert.equal(
    validateSsoTokenClaims({
      tokenTid: "tenant-abc",
      tokenEmail: "user@fremd.com",
      config: CFG,
    }),
    "sso.domainNotAllowed",
  );
});

test("validateSsoTokenClaims — Priorität: enabled vor tenant vor domain", () => {
  // Alle drei sind falsch; der erste Check (enabled) gewinnt.
  assert.equal(
    validateSsoTokenClaims({
      tokenTid: "tenant-evil",
      tokenEmail: "user@fremd.com",
      config: { ...CFG, enabled: false },
    }),
    "sso.configurationError",
  );
});

test("validateSsoTokenClaims — Tenant vor Domain, wenn enabled=true", () => {
  assert.equal(
    validateSsoTokenClaims({
      tokenTid: "tenant-evil",
      tokenEmail: "user@fremd.com",
      config: CFG,
    }),
    "sso.tenantMismatch",
  );
});

// ── JWT-Parsing ────────────────────────────────────────────────────────

function b64url(input: string): string {
  return Buffer.from(input, "utf-8")
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function makeIdToken(payload: Record<string, unknown>): string {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const signature = b64url("not-a-real-signature");
  return `${header}.${body}.${signature}`;
}

test("decodeIdTokenClaims — parst Entra-typisches Payload", () => {
  const token = makeIdToken({ oid: "abc", tid: "xyz", email: "u@f.de" });
  const claims = decodeIdTokenClaims(token);
  assert.ok(claims);
  assert.equal(claims!.oid, "abc");
  assert.equal(claims!.tid, "xyz");
  assert.equal(claims!.email, "u@f.de");
});

test("decodeIdTokenClaims — falsches Format → null", () => {
  assert.equal(decodeIdTokenClaims(""), null);
  assert.equal(decodeIdTokenClaims("nur-ein-teil"), null);
  assert.equal(decodeIdTokenClaims("a.b"), null);
  assert.equal(decodeIdTokenClaims("a.@@@.c"), null);
});

test("extractEntraClaims — bevorzugt oid vor sub für subject, exposed beide", () => {
  const token = makeIdToken({
    oid: "oid-value",
    sub: "sub-value",
    tid: "tenant-abc",
    email: "user@firma.de",
  });
  const claims = extractEntraClaims(token);
  assert.ok(claims);
  // `subject` (für user_sso_identities) bevorzugt oid
  assert.equal(claims!.subject, "oid-value");
  // `sub` (für Better-Auth accounts) ist immer der JWT-Standard-Sub
  assert.equal(claims!.sub, "sub-value");
  assert.equal(claims!.tenantId, "tenant-abc");
  assert.equal(claims!.email, "user@firma.de");
});

test("extractEntraClaims — ohne oid: subject === sub (beide gleich)", () => {
  const token = makeIdToken({
    sub: "sub-value",
    tid: "tenant-abc",
    email: "user@firma.de",
  });
  const claims = extractEntraClaims(token);
  assert.ok(claims);
  assert.equal(claims!.subject, "sub-value");
  assert.equal(claims!.sub, "sub-value");
});

test("extractEntraClaims — ohne sub → null (Better-Auth braucht sub)", () => {
  const token = makeIdToken({
    oid: "oid-value",
    tid: "tenant-abc",
    email: "user@firma.de",
  });
  assert.equal(extractEntraClaims(token), null);
});

test("extractEntraClaims — nutzt preferred_username, wenn email fehlt", () => {
  const token = makeIdToken({
    oid: "oid-value",
    sub: "sub-value",
    tid: "tenant-abc",
    preferred_username: "user@firma.de",
  });
  const claims = extractEntraClaims(token);
  assert.equal(claims?.email, "user@firma.de");
});

test("extractEntraClaims — ohne subject → null", () => {
  const token = makeIdToken({ tid: "tenant-abc", email: "user@firma.de" });
  assert.equal(extractEntraClaims(token), null);
});

test("extractEntraClaims — ohne tid → null", () => {
  const token = makeIdToken({
    oid: "x",
    sub: "x",
    email: "user@firma.de",
  });
  assert.equal(extractEntraClaims(token), null);
});

test("extractEntraClaims — ohne email/preferred_username → null", () => {
  const token = makeIdToken({ oid: "x", sub: "x", tid: "tenant-abc" });
  assert.equal(extractEntraClaims(token), null);
});
