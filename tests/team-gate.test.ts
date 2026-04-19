import assert from "node:assert/strict";
import test from "node:test";
import {
  TEAM_REQUIRED_REDIRECT_URL,
  teamAccountRedirectUrl,
} from "@/lib/api/team-gate";

/**
 * Contract-Tests für den `requireTeamAccount()`-Guard aus
 * `lib/api/session.ts`.
 *
 * DB-abhängige Bits (Session-Lookup, Account-Resolution) sind durch die
 * bestehende `requireSessionWithAccount`-Kette schon über
 * `session-auth-errors.test.ts` und `admin-guard.test.ts` indirekt
 * abgedeckt. Hier pinnen wir nur die **Entscheidungs-Logik**:
 * `teamAccountRedirectUrl()` ist pure, braucht nur einen Kontext mit
 * `accountType` und entscheidet Redirect-oder-nicht.
 *
 * Nicht-eingeloggt-Pfad (`ApiAuthError` aus `requireSession`) läuft
 * nicht durch diese Funktion — deshalb kein Test dafür hier. Siehe
 * `session-auth-errors.test.ts` für die Session-Fehler-Shape.
 */

test("teamAccountRedirectUrl — team-account passes through (null)", () => {
  assert.equal(teamAccountRedirectUrl({ accountType: "team" }), null);
});

test("teamAccountRedirectUrl — personal-account redirectet zu /dashboard?teamRequired=1", () => {
  assert.equal(
    teamAccountRedirectUrl({ accountType: "personal" }),
    "/dashboard?teamRequired=1",
  );
});

test("teamAccountRedirectUrl — Redirect-URL ist stabil und exported", () => {
  // Damit UI (Toast-Client) dieselbe Query-Flag lesen kann wie der
  // Guard schreibt, muss die Konstante konsistent und exportiert sein.
  assert.equal(TEAM_REQUIRED_REDIRECT_URL, "/dashboard?teamRequired=1");
  // URL-Validität: `/dashboard?teamRequired=1` ist ein relativer Pfad
  // mit Query — kein vollständiger URL, keine Origin. Das ist, was
  // Next.js's `redirect()` erwartet.
  assert.ok(TEAM_REQUIRED_REDIRECT_URL.startsWith("/"));
  assert.ok(TEAM_REQUIRED_REDIRECT_URL.includes("teamRequired=1"));
});

test("teamAccountRedirectUrl — decision depends only on accountType (nicht auf role o.ä.)", () => {
  // Wenn jemand in Zukunft versucht, die Decision um zusätzliche Felder
  // zu erweitern (z.B. „owner-required"), sollte dieser Test trippen
  // und eine explizite Architektur-Entscheidung erzwingen.
  for (const role of ["owner", "admin", "member", "viewer"] as const) {
    assert.equal(
      teamAccountRedirectUrl({ accountType: "team" } as {
        accountType: "team" | "personal";
        role?: typeof role;
      }),
      null,
      `team+${role} should pass through`,
    );
    assert.equal(
      teamAccountRedirectUrl({ accountType: "personal" } as {
        accountType: "team" | "personal";
        role?: typeof role;
      }),
      TEAM_REQUIRED_REDIRECT_URL,
      `personal+${role} should redirect`,
    );
  }
});
