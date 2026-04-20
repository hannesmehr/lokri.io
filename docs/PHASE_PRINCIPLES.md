# Phasen-Prinzipien (Prä-Produktion)

**Stand:** April 2026 — lokri ist nicht produktiv, keine Kunden, keine
API-Integrations, die auf Stabilität angewiesen sind.

Solange das so bleibt, gelten folgende Prinzipien bei Refactors und
Framework-Änderungen:

## Kernregel

**Keine Abwärtskompatibilität.** Saubere Replace-Semantik > Kompatibilitäts-
schichten. Keine Adapter, keine Shims, keine Deprecation-Pfade.

## Folgerungen

- **Keine optionalen Parameter für alte Call-Sites.** Bestehende Call-Sites
  werden migriert, nicht umschifft. Wenn eine Signatur strenger wird, werden
  die Call-Sites angepasst — nicht die Signatur verwässert.
- **Keine Dual-Path-Implementierungen.** Wenn ein Code-Pfad durch einen
  besseren ersetzt wird, fliegt der alte raus. Keine Feature-Flags für
  „alt vs neu" solange niemand auf „alt" angewiesen ist.
- **Keine Alias-Namen für renamte APIs.** Bei Umbenennung wird der alte
  Name entfernt, Call-Sites folgen.
- **Tests sind der Schutz, nicht die API-Stabilität.** Wenn alle Tests nach
  einem Refactor grün sind, ist der Refactor fertig. Die Test-Suite ist die
  ausführbare Contract-Spezifikation.

## Was das NICHT heißt

- **Kein Schluder bei Typ-Sicherheit.** Breaking Changes werden als solche
  in Commit-Messages markiert. Das Prinzip sagt nur „wir bauen keinen
  Adapter", nicht „wir können es verschweigen".
- **Kein Ignorieren von Tests.** Wenn ein Refactor 50 Tests bricht, sind
  alle 50 zu migrieren. Nicht einzelne skippen oder löschen, um den
  Refactor „sauber" aussehen zu lassen.
- **Kein Schluder bei Security.** Das Prinzip gilt für API-Form, nicht für
  Security-Garantien. Token-Verifikation, Scope-Enforcement, Encryption
  bleiben enforced.

## Ausnahmen

- **Datenbank-Migrationen.** Daten der Dev-/Prod-DB sind echt und müssen
  beim Schema-Wechsel erhalten bleiben. Kein Drop-Rebuild.
- **Explizit markierte Webhook-Schnittstellen** (falls welche existieren).
  Dort gilt semver-artige Stabilität.
- **OAuth-Token-Formate.** Bestehende Tokens müssen weiterhin verifizierbar
  bleiben — ein Revoke + Re-Issue ist ok, aber kein Format-Bruch ohne
  Migration.

## Wann das Prinzip aufgehoben wird

Sobald lokri produktiv bei Kunden läuft, die auf API-Stabilität angewiesen
sind (z.B. via dokumentierte REST-APIs oder stabile MCP-Contracts).

Konkret: wenn der erste zahlende Team-Account in Betrieb ist und externe
KI-Clients gegen dessen MCP-Endpoint arbeiten — ab dann wird jedes
Breaking-Change der API versioniert, und dieses Dokument wird durch ein
„Kompatibilitäts-Kontrakt"-Dokument ersetzt.

## Konsequenzen für Claude Code / AI-Agents

Wenn ein Prompt oder Task einen Refactor verlangt und du erwägst, einen
Adapter oder Optional-Parameter zu bauen „für Rückwärtskompatibilität" —
erst dieses Doc lesen, dann entscheiden. In Prä-Produktion ist der sauberere
Cut immer richtig.
