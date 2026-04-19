/**
 * Team-Account-Guard: reine, DB-freie Entscheidungs-Helpers.
 *
 * Lebt in einer eigenen Datei (nicht in `session.ts`), damit
 * `tests/team-gate.test.ts` die Invariante pinnen kann, ohne den
 * DB-Client zu initialisieren. Selbes Muster wie
 * `lib/admin/create-user-schema.ts` +
 * `lib/admin/create-account-schema.ts`.
 *
 * Der eigentliche `requireTeamAccount()`-Async-Guard lebt in
 * `session.ts` und nutzt diese Helpers.
 */

/**
 * Ziel-URL, auf die `requireTeamAccount()` redirectet, wenn der aktive
 * Account kein Team ist. Als Konstante extrahiert, damit Tests + UI
 * (Query-Param-Lesen für Toast) dieselbe Stelle referenzieren können.
 *
 * Der Query-Param signalisiert dem Dashboard-Client, dass ein Toast
 * wie „Diese Funktion ist nur für Team-Accounts verfügbar" fällig ist.
 * Die Toast-UX selbst liegt außerhalb dieses Guards — der Guard stellt
 * nur sicher, dass niemand ohne Team auf einer `/team/*`-Seite landet.
 */
export const TEAM_REQUIRED_REDIRECT_URL = "/dashboard?teamRequired=1";

/**
 * Reine Entscheidungsfunktion: welche URL soll `requireTeamAccount()`
 * redirecten — `null` = pass-through. Nur von `accountType` abhängig;
 * Role, OwnerAccountId etc. spielen keine Rolle (die Logik ist bewusst
 * schlank, damit spätere Erweiterungen einen expliziten Refactor
 * erfordern statt stillschweigend mitzulaufen).
 */
export function teamAccountRedirectUrl(
  ctx: { accountType: "personal" | "team" },
): string | null {
  if (ctx.accountType === "team") return null;
  return TEAM_REQUIRED_REDIRECT_URL;
}
