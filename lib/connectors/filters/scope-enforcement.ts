/**
 * `scopeEnforcementFilter` — Pre-Filter, verhindert Requests auf nicht-
 * allowlisted Scopes.
 *
 * Läuft *vor* `provider.executeTool`. Prüft pro Eintrag in
 * `ctx.requiredScopes`, dass er in `ctx.executionContext.scopes`
 * (= der DB-Allowlist der Integration) enthalten ist. Wenn nicht:
 * `ConnectorScopeError` — der Upstream sieht den Call nie.
 *
 * Das ist Kosten- und Security-relevant:
 *   - Spart Upstream-API-Quota bei fehlerhaften Requests
 *   - Schliesst die „ich durchreiche ein Token mit zu vielen Rechten"-
 *     Lücke. Selbst wenn der PAT Zugriff auf 50 Confluence-Spaces hat,
 *     lässt dieser Filter nur die 3 allowlisted durch.
 *
 * Implementation ist bewusst naiv (Set-Lookup, O(N+M)). Für grosse
 * Allowlists (tausende Scopes) optimieren wir später.
 */

import { ConnectorScopeError } from "../errors";
import type { ConnectorFilter } from "./types";

function scopeKey(type: string, identifier: string): string {
  return `${type}\u0000${identifier}`;
}

export const scopeEnforcementFilter: ConnectorFilter = {
  name: "scope-enforcement",
  requestPhase(ctx) {
    if (ctx.requiredScopes.length === 0) {
      return ctx;
    }
    const allowlist = new Set(
      ctx.executionContext.scopes.map((s) =>
        scopeKey(s.scopeType, s.scopeIdentifier),
      ),
    );
    for (const required of ctx.requiredScopes) {
      if (!allowlist.has(scopeKey(required.type, required.identifier))) {
        throw new ConnectorScopeError(required);
      }
    }
    return ctx;
  },
};
