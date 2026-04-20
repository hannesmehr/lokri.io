# Security-Review — Connectors + MCP

**Datum:** April 2026
**Scope:** Connector-Framework (`lib/connectors/`), MCP-Endpoint
(`app/api/mcp/route.ts`), Unified-Search-Federation
(`lib/mcp/tools/search/`), Confluence-Cloud-Provider.

**Reviewer:** Codex (2026-04)

**Kontext:** Lokri steht kurz vor dem ersten produktiven Einsatz. Vor
dem Rollout ein dedizierter Review der MCP-Tool-Surface + der
Connector-Integration, weil das die erste Stelle ist, an der externe
KI-Clients (Claude Desktop, ChatGPT etc.) auf externe Datenquellen
(Confluence, später Slack/GitHub) zugreifen — und damit neue
Angriffsvektoren öffnet, die pgvector-only nicht hatte.

---

## Paket A — Connector/MCP (abgearbeitet)

Drei Findings, die entlang der Federation-Kette
`runUnifiedSearch → Gateway → Provider → HTTP-Client` liegen und vor
dem Rollout geschlossen sein mussten.

### P1-1 — SSRF via Confluence-Pagination-Links

**Finding:** `ConfluenceCloudClient.getAbsolute()` folgte blind dem
URL-String aus Confluence-v2-Responses (`_links.next` bei Cursor-
Pagination). Die Prüfung war nur `/^https?:\/\//`-basiert — absolute
URLs wurden durchgelassen, Protocol-relative URLs (`//evil.com/…`)
rutschten als „relativ" durch und wurden zu `https://<siteUrl>//evil.com/…`
— eine Form, die fetch in manchen Kombinationen zu `evil.com`
resolved.

**Angriffs-Szenarien:**
- Kompromittiertes Atlassian-Konto liefert einen manipulierten
  `_links.next` → unser Client folgt → Basic-Auth-Header (Email +
  API-Token base64) geht an fremden Host.
- MITM auf dem Pfad Atlassian ↔ lokri-Server setzt `_links.next`
  um.
- Dev-Proxy (Charles, mitmproxy) kann absichtlich Test-Payloads
  injizieren; ohne Guard ist das Staging-Security = Prod-Security.

**Impact:** Credential-Leak (Email + API-Token in Basic-Auth-Form)
an den SSRF-Ziel-Host. Für das Empro-Token: Lesezugriff auf alle
Spaces, die der Token sehen darf.

**Fix:** Zentraler `assertSameOriginOrThrow()` in `request()` — parst
jeden URL-Input mit `new URL(input, baseOrigin)` (resolved auch
Protocol-Relative) und vergleicht `origin`. Mismatch ⇒
`ConnectorUpstreamError` bevor fetch gerufen wird.

**Commit:** `cfaa0e4`

**Test-Coverage:** `tests/confluence-cloud-client-ssrf.test.ts` (8
Cases) — Foreign-Host, Protocol-Relative, Port-Mismatch,
Protocol-Downgrade alle blockiert; Relative/Same-Origin/Uppercase-
Host passieren; Auth-Header erscheint nicht in Fehler-Messages.

---

### P1-2 — Federation-Abort war Promise.race statt echter Cancel

**Finding:** `externalSearch.withTimeout()` nutzte `Promise.race`
mit einem setTimeout-Resolver. Bei 5s-Timeout entschied das
Federation-Layer lokal auf „degraded", aber der Upstream-Fetch lief
im Hintergrund weiter — Socket blieb offen, Atlassian-API-Quota
wurde verbrannt, `maxDuration = 60s` am MCP-Endpoint konnte durch
langlaufende Background-Requests überschritten werden.

**Angriffs-Szenarien:**
- Slow-Lorris-Style: ein User macht 20 Searches hintereinander. Jede
  „timeout"et nach 5s aus Federation-Sicht, aber die Upstream-
  Fetches laufen bis Minuten. Der Node-Process hält N × 20
  lingering Sockets.
- Langsamer Atlassian-Endpoint (Maintenance) → lokri reagiert
  langsam, weil viele Background-Fetches laufen.

**Impact:** Resource-Exhaustion; langfristig Denial-of-Service
potential bei wenigen Concurrent-Requests. API-Quota-Kostenrisiko.

**Fix:** `AbortSignal`-Kette durch die gesamte Federation:

```
runUnifiedSearch
  → pro Source: AbortController + setTimeout(abort, 5000)
  → externalSearch({ abortSignal })
  → ExecuteConnectorToolInput.abortSignal
  → ExecutionContext.abortSignal
  → ConfluenceCloudProvider.buildClient(signal)
  → ConfluenceCloudClient via AbortSignal.any([internal, external])
  → fetch({ signal })
```

Frühester Abort gewinnt; Socket wird tatsächlich geschlossen.

**Commit:** `cfaa0e4`

**Test-Coverage:**
- `tests/confluence-cloud-client.test.ts`: external-signal-wins +
  internal-timeout-standalone
- `tests/mcp-search-external.test.ts`: fast-path (aborted before
  dispatch), during-execute, signal-passthrough
- `tests/connectors-gateway.test.ts`: abortSignal in ExecutionContext,
  AbortError → degraded

---

### P1-3 — Unbegrenzte Parallel-Fanouts auf External Sources

**Finding:** `runUnifiedSearch` machte `Promise.all(externalSources.map(…))`
ohne Limit. Bei 20 gemappten Spaces → 20 parallele Confluence-Calls.

**Angriffs-Szenarien:**
- User mit legitim vielen Mappings triggert einen Search → 20
  Atlassian-API-Calls gleichzeitig → Rate-Limit (429) vom
  Atlassian-Endpoint → alle Sources degraded, User bekommt keine
  Hits.
- Bewusster Denial: Angreifer mit Admin-Rechten mappt absichtlich
  viele Spaces und löst Search-Storm aus → API-Quota-Burn für
  lokri + Atlassian-Side.

**Impact:** Self-DoS über legitimen Search-Pfad. Kostenrisiko durch
API-Quota-Verbrauch.

**Fix:** Neuer `withConcurrencyLimit`-Helper,
`EXTERNAL_SEARCH_CONCURRENCY = 4`. Worst-Case: ceil(N/4) × 5s.

**Commit:** `cfaa0e4`

**Test-Coverage:** `tests/mcp-search-federation-concurrency.test.ts`
(6 Cases) — peak ≤ limit bei 20 items / limit 4, rejected workers
crashen nicht, order preserved, limit > items, empty input.

---

### P2-1 — sanitizeArgs nur key-basiert

**Finding:** `sanitizeArgs` redactet nur basierend auf Object-Keys
(`token`, `apiKey`, `password` etc.). Tokens in Freitext-Argumenten
(`{ query: "was ist ATATT3x…" }`) oder in Array-Elementen rutschten
durch und landeten im `connector_usage_log.request_metadata`.

**Angriffs-Szenarien:**
- User fragt MCP-Tool mit Token im Query-String → Token landet im
  Audit-Log → Admin (oder ein kompromittiertes Admin-Konto) sieht
  den Klartext-Token.
- Log-Export (GDPR-Request, Support-Ticket, Backup) enthält die
  Tokens in Klartext.

**Impact:** Sekundärer Credential-Leak; nicht direkter Attack, aber
Audit-Log wird zur Schwachstelle statt zum Schutzmechanismus.

**Fix:** Ebene-2 `scrubSecretValues(string)` scannt auf 8 spezifische
Token-Formate (Bearer, lokri, Atlassian, GitHub, Slack, JWT, AWS,
OpenAI). Word-Boundaries + Multi-Match pro String. Key-Redact hat
Vorrang bei Kollision. Kein generic-long-Catch-All wegen false-
positives auf UUIDs + Hashes.

**Commit:** `99195ab`

**Test-Coverage:** `tests/connectors-sanitize.test.ts` (+15 Cases) —
alle 8 Pattern einzeln, GitHub alle 5 Prefixes, harmlose Strings
bleiben, UUIDs/SHAs bleiben, Word-Boundary, Multi-Token,
Key-Redact-Priorität, Deep-Walk, Top-Level-API.

---

## Paket B — ZIP-Import (offen)

**Scope:** `lib/files/import-zip.ts`, `app/api/files/import/route.ts`
(falls existent — Block-Prompt wird den Codepfad konkret kartieren).

**Findings werden im separaten Build-Prompt behandelt.** Bekannt sind
aus dem Review-Entwurf:
- Zip-Bomb-Protection (Entpackgröße-Cap)
- Path-Traversal bei ZIP-Entry-Namen
- MIME-Type-Check nach Content, nicht nach Extension

---

## Paket C — Error-Hygiene (offen)

**Scope:** Quer durchs Repo — sicherstellen, dass Connector-, Auth-
und Upstream-Errors keine sensitiven Details an den Client leaken
(Stack-Traces in Prod, DB-Constraint-Namen, interne Pfade).

**Findings im separaten Build-Prompt.** Bekannt:
- Einige API-Routes durchreichen `err.message` direkt an den Client
- Drizzle-Error-Messages enthalten die SQL-Query im Klartext
- Better-Auth schlecht dokumentierte Error-Codes

---

## Abarbeitungsstand (April 2026)

**Paket A (Connector/MCP) — abgeschlossen:**

| Finding | Commit | Datum |
|---|---|---|
| P1 SSRF-Fix im Confluence-Client | `cfaa0e4` | 2026-04 |
| P1 Federation-Abort-Signal durchgereicht | `cfaa0e4` | 2026-04 |
| P1 External-Search-Concurrency-Limit = 4 | `cfaa0e4` | 2026-04 |
| P2 sanitizeArgs Value-Heuristiken | `99195ab` | 2026-04 |
| Review-Doc im Repo | *(dieser Commit)* | 2026-04 |

Gesamt-Testlauf nach Paket A: **431 pass + 2 skipped = 433**, 0 fails.
Keine Regressionen in den vor-Block-1-bestehenden 396 Tests.

**Paket B (ZIP-Import) — offen:** separater Build-Prompt, kein Datum
fixiert.

**Paket C (Error-Hygiene) — offen:** separater Build-Prompt, kein
Datum fixiert.

---

## Referenzen

- `docs/CONNECTOR_FRAMEWORK.md` — Design-Dokument des Frameworks
- `docs/PHASE_PRINCIPLES.md` — keine Abwärtskompat in Prä-Produktion
  (relevant für die Signatur-Änderungen am Gateway)
- [RFC 8693 (OAuth Token Exchange)](https://datatracker.ietf.org/doc/html/rfc8693)
  — Hintergrund für das Scope-Token-Trennungs-Prinzip
