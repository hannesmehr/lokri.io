/**
 * `scopePostFilter` — Post-Filter, prüft dass die Upstream-Response
 * ausschliesslich Daten aus allowlisted Scopes enthält.
 *
 * Läuft *nach* `provider.executeTool`. Die Tool-Adapter-Schicht extrahiert
 * aus der Upstream-Response die beobachteten Scope-Refs (z.B. aus
 * Confluence-Hits das `space.key`-Feld pro Hit) und legt sie als
 * `ctx.observedScopes` an. Dieser Filter prüft: jeder beobachtete
 * Scope muss in der Allowlist sein.
 *
 * Wozu? Defense-in-Depth. Selbst wenn:
 *   - Der Upstream fehlerhaft Daten ausserhalb des Scope-Queries liefert
 *     (API-Bug, Fehlkonfiguration, Token mit zu viel Macht)
 *   - Der Provider-Code die Scope-Eingrenzung im CQL falsch baut
 *   - Der Pre-Filter eine Lücke hat
 *
 * … fliegt der Leak hier auf und die Response wird abgelehnt statt
 * an den MCP-Client zu gehen. Das ist der klassische „trust but verify"-
 * Ansatz aus Prinzip 5 (Scope Enforcement in lokri, nicht im Upstream).
 *
 * Bei Verletzung: `ConnectorScopePostError`. Gateway catcht das und
 * markiert im Usage-Log als `status: failure` — das ist bewusst lauter
 * als eine Degradation, weil es einen Connector-Provider-Bug oder
 * echten Permission-Drift anzeigt.
 */

import { ConnectorScopePostError } from "../errors";
import type { ConnectorFilter } from "./types";

function scopeKey(type: string, identifier: string): string {
  return `${type}\u0000${identifier}`;
}

export const scopePostFilter: ConnectorFilter = {
  name: "scope-post",
  responsePhase(ctx) {
    if (ctx.observedScopes.length === 0) {
      return ctx;
    }
    const allowlist = new Set(
      ctx.executionContext.scopes.map((s) =>
        scopeKey(s.scopeType, s.scopeIdentifier),
      ),
    );
    for (const observed of ctx.observedScopes) {
      if (!allowlist.has(scopeKey(observed.type, observed.identifier))) {
        throw new ConnectorScopePostError(observed);
      }
    }
    return ctx;
  },
};
