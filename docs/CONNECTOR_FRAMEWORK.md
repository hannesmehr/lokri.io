# Connector Framework — Design Document

**Status:** Design finalisiert, Implementation ausstehend
**Erstellt:** April 2026
**Basis:** Obot-Learnings (`docs/REFERENCES/obot-learnings.md`) + lokri-Produktvision ("persistenter KI-Kontext")

---

## Zweck und Abgrenzung

Das Connector Framework macht externe Datenquellen (Confluence, Slack, GitHub, Jira, n8n, …) für MCP-Clients über lokri zugänglich. Dabei verbindet es externe Inhalte mit lokri-Spaces zu einem einheitlichen Wissensraum.

**Nicht Teil dieses Frameworks:**
- Hosten von MCP-Servern (Gatana/Obot-Feature, lokri hostet nicht)
- Custom-MCP-Integration durch Power-User (separates späteres Feature)
- Agent-/Chat-Framework (lokri ist Substrat, nicht Agent)

---

## Leitprinzipien

Das Framework folgt fünf Prinzipien. Vier stammen aus der Obot-Analyse, das fünfte ist lokri-spezifisch.

### Prinzip 1: Gateway dünn, Connector-Schicht dick

Der MCP-Endpoint macht nur Protokoll-Handling, Auth und Routing. Alle Connector-spezifische Intelligenz (Authorization, Audit, Token-Exchange, Request-Filtering) liegt in der Connector-Schicht.

### Prinzip 2: Client-Token und Upstream-Token strikt getrennt

Der lokri-Token (ein `api_tokens`-Eintrag) authentifiziert gegen lokri-Permissions. Upstream-Tokens (Confluence-PAT, OAuth-Tokens für externe Systeme) leben in `connector_integrations.credentials`. Die beiden dürfen sich nie vermischen.

### Prinzip 3: Connector-Typen als Code, Integrationen als Daten

`ConnectorDefinition` lebt als Code im Repository (Import, keine DB-Row). `ConnectorIntegration` lebt als DB-Row mit User-konfigurierten Werten. Ein neuer Connector-Typ bedeutet Code-Deploy, keine DB-Migration.

### Prinzip 4: Scoped-Tokens unterstützen Composite-Scopes

Aktuelle `api_tokens.space_scope` (welche Spaces) wird später ergänzt um `connector_scope` (welche Connector-Integrationen). Beides zusammen bildet einen Composite-Scope. **Nicht im MVP** — aber das Schema-Design verbaut es nicht.

### Prinzip 5: Scope Enforcement passiert in lokri, nicht im Upstream

Jede externe API-Response durchläuft `resolveScope()` in lokri, bevor sie an den MCP-Client zurückgeht. Die impliziten Permissions des Upstream-Tokens sind niemals die effektiven Permissions. Das ist die Defense-in-Depth gegen naives Token-Durchreichen.

---

## Domain-Modell

### Begriffsdefinitionen

| Begriff | Bedeutung | Beispiel |
|---|---|---|
| **Connector** | Integration-Typ zu einem externen System. Als Code definiert. | "Confluence-Cloud-Connector" |
| **ConnectorDefinition** | Statische Definition (auth-type, tools, scope-model) | `{ id: 'confluence-cloud', ... }` |
| **ConnectorIntegration** | Konfigurierte Instanz eines Connectors für ein Team | "Empro Confluence" (DB-Row) |
| **ConnectorScope** | Whitelist-Eintrag: welche Sub-Ressource ist freigegeben | "Confluence-Space ENGINEERING" |
| **SpaceExternalSource** | Mapping: lokri-Space ↔ ConnectorScope | Space "Engineering Notes" → Confluence-ENG |
| **ConnectorProvider** | Runtime-Komponente, die Requests bearbeitet | `ConfluenceCloudProvider` (Klasse) |
| **Filter** | Pipeline-Stufe in der Request/Response-Verarbeitung | `scopeEnforcementFilter`, `auditLogFilter` |

### Relationen

```
owner_account (Team)
  └─ 1..n connector_integrations
       ├─ credentials (encrypted)
       ├─ config
       └─ 1..n connector_scope_allowlist
            (Confluence-Space-Keys, GitHub-Repo-Paths, …)

space (lokri-eigener Space)
  └─ 1..n space_external_sources
       └─ referenziert connector_scope_allowlist
       (MVP: UI-seitig 1:1 zwischen scope und space,
        Schema erlaubt n:1 für Phase 2)
```

---

## MVP-Scope

### Was im MVP gebaut wird

- Connector-Framework-Grundgerüst (Registry, ConnectorProvider-Interface, Filter-Pipeline)
- **Ein Connector:** Confluence Cloud
- **Auth:** Personal Access Token (PAT), kein OAuth2
- **Scope-Granularität:** Confluence-Space-Keys (keine Page-Tree-Filter)
- **Mapping:** 1:1 im UI zwischen lokri-Space und Confluence-Space (n:1-fähig im Schema)
- **Vier MCP-Tools:**
  - `search` (unified über lokri + externe Quellen)
  - `confluence-read-page`
  - `confluence-list-recent`
  - `confluence-get-page-children`
- **Kein Indexing externer Inhalte** (Live-Query-Only)
- **Permissions:** `canPerform(user, space, action, context?)`-Interface, dahinter aktuelle Team-Rollen-Logik
- **Audit- und Usage-Log** in gemeinsamer Tabelle `connector_usage_log`

### Was explizit nicht im MVP ist

- OAuth2-basierte Connectors
- Weitere Connectors (Slack, GitHub, Jira, n8n — Schema ist vorbereitet)
- Write-Operationen zu Confluence (Page erstellen/editieren)
- Page-Tree-Scope (nur Space-Level)
- Indexierung externer Inhalte (semantische Suche nur über lokri-eigene Inhalte)
- Space-Rollen (Schnittstelle da, dahinter Team-Rollen)
- Composite-Scoped-Tokens (nur `space_scope`, kein `connector_scope`)
- Caching von External-Responses
- Rate-Limiting zum Upstream
- Retry-Logic bei Upstream-Fehlern
- Custom-MCP-Server-Konfiguration

### Fertig-Definition

Ein MVP ist fertig, wenn:
1. Setup einer Confluence-Integration in lokri in unter 10 Minuten möglich ist
2. Mapping einer Confluence-Space auf einen lokri-Space funktioniert
3. MCP-Request `search` über Claude Desktop liefert gemischte Ergebnisse aus lokri und Confluence
4. Graceful Degradation funktioniert (Confluence down → lokri-Ergebnisse trotzdem)
5. Audit-Events werden geschrieben
6. Hannes nutzt lokri mit der echten Empro-Confluence in seinem Arbeitsalltag

---

## Architektur

### Komponenten-Übersicht

```
┌─ MCP-Endpoint (/api/mcp) ──────────────────────────┐
│ • Token-Verifikation                                │
│ • Tool-Dispatch                                     │
│ • Protocol-Handling                                 │
└──────────────┬──────────────────────────────────────┘
               │
               ▼
┌─ Tool-Handler (lib/mcp/tools/*) ────────────────────┐
│ • search          (Federation über Quellen)         │
│ • confluence-*    (Connector-spezifisch)            │
└──────────────┬──────────────────────────────────────┘
               │
               ▼
┌─ ConnectorGateway (lib/connectors/gateway.ts) ──────┐
│ • Space-Resolution (welche Spaces darf Token)       │
│ • External-Source-Resolution (welche Scopes gemappt)│
│ • Parallel-Dispatch an ConnectorProviders           │
│ • Result-Aggregation + Degradation-Metadata         │
└──────────────┬──────────────────────────────────────┘
               │
               ▼
┌─ ConnectorRegistry (lib/connectors/registry.ts) ────┐
│ • Map<connector_type, ConnectorProvider>            │
│ • Statisch im Code registriert                      │
│ • Ein Eintrag pro ConnectorDefinition               │
└──────────────┬──────────────────────────────────────┘
               │
               ▼
┌─ ConnectorProvider (pro Connector-Typ) ─────────────┐
│ • definition: ConnectorDefinition                   │
│ • translate(request) → upstream API-Call            │
│ • Filter-Pipeline: pre, translate, post, audit      │
└─────────────────────────────────────────────────────┘
```

### Datenmodell

**`connector_integrations`**

```sql
id                  uuid primary key
owner_account_id    uuid not null references owner_accounts(id)
connector_type      text not null             -- 'confluence-cloud'
display_name        text not null             -- User-definiert
auth_type           text not null             -- 'pat', 'oauth2'
credentials         jsonb not null            -- AES-256-GCM encrypted
config              jsonb not null            -- { site_url, … }
enabled             boolean default true
last_tested_at      timestamptz
last_error          text
created_at          timestamptz default now()
updated_at          timestamptz
```

**`connector_scope_allowlist`**

```sql
id                        uuid primary key
connector_integration_id  uuid not null references connector_integrations(id)
scope_type                text not null             -- 'confluence-space'
scope_identifier          text not null             -- 'ENGINEERING'
scope_metadata            jsonb                     -- display-name etc.
created_at                timestamptz default now()

unique (connector_integration_id, scope_type, scope_identifier)
```

**`space_external_sources`**

```sql
id                   uuid primary key
space_id             uuid not null references spaces(id)
connector_scope_id   uuid not null references connector_scope_allowlist(id)
added_by_user_id     uuid not null references users(id)
created_at           timestamptz default now()

unique (space_id, connector_scope_id)
-- MVP: UI-seitig auch unique (connector_scope_id)
-- Phase 2: constraint aufgehoben für n:1 Compositions
```

**`connector_usage_log`**

```sql
id                        uuid primary key
owner_account_id          uuid not null references owner_accounts(id)
user_id                   uuid references users(id)
connector_integration_id  uuid references connector_integrations(id)
space_id                  uuid references spaces(id)
action                    text not null             -- 'search', 'read-page', …
status                    text not null             -- 'success', 'failure', 'degraded'
request_metadata          jsonb
response_metadata         jsonb
duration_ms               integer
tokens_used               integer default 0
created_at                timestamptz default now()

index (owner_account_id, created_at desc)
index (connector_integration_id, created_at desc)
```

### ConnectorDefinition (Code-Struktur)

```typescript
// lib/connectors/types.ts
export interface ConnectorDefinition {
  id: string;                              // 'confluence-cloud'
  name: string;                            // 'Confluence Cloud'
  description: string;
  icon: string;
  category: 'knowledge' | 'code' | 'messaging' | 'files' | 'automation';
  authType: 'pat' | 'oauth2';
  scopeModel: {
    type: string;                          // 'confluence-space'
    label: string;                         // 'Confluence-Spaces'
    identifierLabel: string;               // 'Space-Key'
  };
  authConfig?: {
    // PAT-Felder oder OAuth-URLs
  };
  tools: string[];                         // ['search', 'read-page', …]
}
```

### ConnectorProvider (Interface)

```typescript
// lib/connectors/provider.ts
export interface ConnectorProvider {
  readonly definition: ConnectorDefinition;

  // Token-Validierung beim Setup
  testCredentials(
    credentials: unknown,
    config: unknown
  ): Promise<TestResult>;

  // Scope-Discovery: verfügbare Scopes vom Upstream abholen
  // (z.B. "welche Confluence-Spaces hat dieser User?")
  discoverScopes(
    credentials: unknown,
    config: unknown
  ): Promise<DiscoveredScope[]>;

  // Tool-Execution
  executeTool(
    toolName: string,
    args: unknown,
    context: ExecutionContext
  ): Promise<ToolResult>;
}

export interface ExecutionContext {
  integration: ConnectorIntegration;
  scopes: ConnectorScope[];                 // gescopte Whitelist
  callerUserId: string;
  spaceId: string;
}
```

### Filter-Pipeline

```typescript
// lib/connectors/filters.ts
export interface ConnectorFilter {
  name: string;
  requestPhase?(ctx: RequestContext): Promise<RequestContext | FilterBlock>;
  responsePhase?(ctx: ResponseContext): Promise<ResponseContext | FilterBlock>;
}

// MVP-Filter in dieser Reihenfolge:
const MVP_PIPELINE: ConnectorFilter[] = [
  scopeEnforcementFilter,   // prüft pre: request zielt auf gescopte Resource
  // → provider.translate() läuft dazwischen, nicht als Filter
  scopePostFilter,          // prüft post: Response enthält nur gescopte Data
  auditLogFilter,           // post: schreibt connector_usage_log
];
```

---

## Request-Flow (search)

```
1. MCP-Request kommt an /api/mcp
2. Token-Verifikation → userId, ownerAccountId, spaceScope[], role
3. Tool-Dispatch an search-handler
4. Space-Resolution: spaces = token.spaceScope ∩ canPerform(user, space, 'read')
5. External-Source-Resolution:
   SELECT ... FROM space_external_sources
   JOIN connector_scope_allowlist ...
   JOIN connector_integrations ...
   WHERE space_id IN (spaces) AND integration.enabled = true
6. Parallel-Dispatch via Promise.allSettled():
   a) Internal: pgvector-Query über notes/files WHERE space_id IN (spaces)
   b) Pro External-Scope: ConnectorRegistry.get(type).executeTool('search', …)
      • Filter-Pipeline: scopeEnforcementFilter → translate → scopePostFilter → auditLogFilter
      • Timeout: 5s
      • Bei Fehler/Timeout: degraded result ({})
7. Result-Aggregation:
   • Dedup (theoretisch)
   • Sortierung nach hybrid-score (semantic + keyword)
   • Pro-Quelle-Cap: max 20 Hits pro Quelle
   • source-Marker: jeder Hit hat source: 'lokri' | 'confluence-cloud' | …
   • degraded_sources: Liste nicht-erreichter Quellen
8. MCP-Response:
   {
     results: [ { source, title, snippet, url, space, score }, … ],
     meta: { degraded_sources: [{ name, reason }] }
   }
```

### Error-Handling

| Szenario | Behandlung |
|---|---|
| PAT expired | `ConnectorAuthError` → `connector_integrations.last_error` gesetzt, UI zeigt "Token erneuern", MCP-Response enthält degraded_source |
| Upstream timeout (>5s) | Degradation, lokri-Hits trotzdem, Usage-Log mit `status: degraded` |
| Scope-Allowlist leer | Pre-Filter blockt vor Upstream-Call, keine Kosten, leere Results aus dieser Quelle |
| Upstream 429 (Rate-Limit) | Degradation, `last_error` gesetzt. MVP: kein Retry. |
| Token-Scope ungleich Space | Space fliegt in Schritt 4 raus, keine External-Sources befragt |

---

## Kosten-Strategie

### MVP-Ansatz

**Keine Embedding-Kosten für externe Inhalte.** Live-Query-Pattern — externe Quellen werden pro Search live befragt, nicht indexiert.

Externe API-Calls sind für lokri kostenlos (nur Compute-Zeit). Die eigentlichen Kosten entstehen beim User:
- Confluence: Rate-Limits, nicht Geld
- Slack: API-Rate-Limits
- GitHub: API-Rate-Limits
- OpenAI-Embeddings: nur für lokri-eigene Inhalte, bleibt unverändert

### Phase-2-Strategie (nicht im MVP)

Wenn semantische Suche über externe Inhalte gewünscht: **Indexierung als Pro-Feature, gekoppelt an BYOK-Embedding-Key.**

- User ohne BYOK: Live-Query bleibt (kein Upgrade-Pfad)
- User mit BYOK: Kann "Tiefe Indexierung" pro Space aktivieren
- Embedding-Kosten laufen über den eigenen OpenAI-Key
- Lokri trägt keine variablen Kosten

### Plan-Begrenzung

Anzahl gleichzeitiger External-Sources pro Space:

| Plan | Max External Sources pro Space |
|---|---|
| Free | 1 |
| Starter | 3 |
| Pro | 5 |
| Business | unlimited |

Zahlen sind Platzhalter, Enforcement passiert beim Mapping-Setup.

---

## Permissions und Rollen

### Aktueller Stand (MVP)

`canPerform(user, space, action, context?)`-Interface existiert.

```typescript
async function canPerform(
  userId: string,
  spaceId: string,
  action: 'read' | 'write' | 'admin' | 'map-external',
  context?: unknown,
): Promise<boolean>
```

Dahinter: Team-Rollen-Logik.
- `read`: User ist Team-Mitglied
- `write`: role ∈ [owner, admin, member]
- `admin`: role ∈ [owner, admin]
- `map-external`: role ∈ [owner, admin] — nur diese dürfen External-Sources mappen

### Sollstand (später)

Space-eigene Rollen können User-individual zuweisen. GitHub-artig: ein User kann "Editor" in Space A sein, "Viewer" in Space B, ohne dass sich das aus der Team-Rolle ergibt.

Das Interface bleibt gleich — die Funktion wird nur intern intelligenter.

### Token-Scope-Handling (MVP)

Scoped-Tokens haben aktuell `space_scope uuid[]`. Wenn ein Token Zugriff auf Space A hat und Space A gemappte External-Sources hat, darf der Token auch auf die External-Sources zugreifen.

**Kein separater Connector-Scope im MVP.** Das kommt mit Prinzip 4, Phase 2.

---

## UI-Flows (Übersicht, keine Mockups)

### Flow 1: Connector einrichten

```
/team/connectors (neu) → "Neue Integration"
  → Connector-Typ auswählen (MVP: nur Confluence)
  → Auth-Daten eingeben (Email + PAT + site_url)
  → testCredentials() läuft
     ├─ OK: Scope-Discovery → Liste verfügbarer Confluence-Spaces
     └─ Fail: Fehler anzeigen, zurück
  → Scope-Whitelist auswählen (Checkboxen)
  → Speichern → connector_integrations + connector_scope_allowlist entries
```

### Flow 2: External-Source auf Space mappen

```
/spaces/[id]/settings → "Externe Quellen" Section
  → "Neue Quelle verknüpfen"
  → Liste: alle connector_scope_allowlist-Einträge des Teams,
    die noch nicht gemappt sind (MVP 1:1-Constraint)
  → Auswählen → space_external_sources entry
```

### Flow 3: Integration-Status & Fehler-Handling

```
/team/connectors → Liste aller Integrationen
  → Status-Badge: active / auth-failed / disabled
  → "Token erneuern" bei auth-failed
  → "Test-Verbindung" manuell
  → last_error prominent sichtbar
```

---

## Offene Fragen (nach Build-Prompt zu klären)

1. **Scope-Discovery-Limits:** Confluence kann tausende Spaces haben. Bei `discoverScopes()` paginieren wir und zeigen ein Suchfeld? Oder nur ersten Batch und "mehr laden"-Button?

2. **PAT-Validation-Frequenz:** Aktuell validieren wir beim Setup und optional via "Test-Verbindung"-Button. Sollen wir zusätzlich alle N Stunden automatisch validieren? Oder erst beim ersten Fehlschlag reagieren?

3. **Graceful-Degradation-Messaging im MCP-Response:** Wie prominent wird das dem MCP-Client (Claude Desktop) kommuniziert? Als Text im Result? Als Meta-Feld? Beides?

4. **Confluence-CQL-Builder:** Wir bauen die Confluence-Query (CQL) aus dem User-Query dynamisch zusammen. Wie robust muss der Builder sein? Special Characters escape, CQL-Injection verhindern?

5. **Connector-Icon-Asset-Management:** Icon-Strings als SVG-Import oder Icon-Library-Referenzen (lucide-react etc.)? Konsistenz mit bestehenden lokri-Icons?

Diese Fragen sind nicht Blocker für den Start, aber brauchen Antworten während der Implementation.

---

## Roadmap-Einordnung

### Phase 1 — MVP (Gegenstand dieses Dokuments)

- Framework-Grundgerüst
- Confluence-Cloud-Connector mit PAT
- Space-Mapping 1:1
- Live-Query
- Audit- und Usage-Log-Tabelle

### Phase 2 — Erweiterung

- Zweiter Connector (Slack mit besonderem Fokus auf Channel-Scoping)
- OAuth2-Support (parallel zu PAT)
- n:1-Mapping aktiviert (Constraint gelockert, UI erlaubt Mehrfachnutzung)
- Space-Rollen (`canPerform`-Logik erweitert)
- Rate-Limit-Filter
- Retry-Logic mit Exponential Backoff

### Phase 3 — Enterprise-Readiness

- Optional: Tiefe Indexierung externer Inhalte als BYOK-Pro-Feature
- External Secret Stores (Credentials aus Vault statt aus lokri-DB)
- Composite-Scoped-Tokens (`connector_scope` zusätzlich zu `space_scope`)
- Write-Operationen zu Confluence/Jira (Create/Edit)
- Connector-spezifische Webhook-Filter (Audit nach außen, Event-Streams)

### Phase 4 — Community-Level

- Custom-MCP-Server (Gatana-Style): User kann beliebige MCP-URLs hinzufügen
- Registry-Search: offizielle MCP-Registry als Quelle
- Self-Service für Team-Admins: eigene Connector-Definitionen als Template

---

## Referenzen

- `docs/REFERENCES/obot-learnings.md` — Obot-Architektur-Analyse
- `docs/SSO_SETUP.md` — Vorbild für Setup-Flows (Admin-Consent-Pattern)
- `docs/USER_SETTINGS_DESIGN.md` — UI-Patterns
- RFC 8693 (OAuth Token Exchange) — später für Phase 3
