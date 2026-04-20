# MCP-Client-Onboarding

**Status:** Produktiv, Stand April 2026.
**Entry-Point:** `/connect` (eingeloggt).

lokri.io ist ein MCP-Server. Der Onboarding-Flow unter `/connect` führt
Knowledge-Worker durch die Einrichtung eines MCP-Clients mit lokri — ohne
Copy-Paste-Fehler bei Config-Snippets und ohne OAuth-Handbuchsuche.

Unterstützte Clients:

| Client | Auth-Modus | Flow |
|---|---|---|
| **Claude Desktop** (macOS/Windows/Linux) | Bearer-Token | 4-Step-Wizard mit Scope + Token-Name + Config + Fertigstellung |
| **ChatGPT / Codex** (Pro, Team, Enterprise) | OAuth 2.1 via RFC 7591 DCR | Anleitungs-UI mit MCP-URL + 7-Schritte-Checkliste |

## Claude Desktop — Bearer-Token-Flow

**Route:** `/connect/claude-desktop`

1. **Scope**: alle Spaces oder ausgewählte; separater Read-only-Toggle. Tokens sind gültig bis widerrufen (Phase-1-Schema — automatische Ablaufzeit kommt später).
2. **Name**: User-freier Label (Default aus Session-Namen).
3. **Config**: Plaintext-Token + Claude-Desktop-Config-Snippet + OS-spezifischer Pfad zur `claude_desktop_config.json`. Token wird **einmalig** angezeigt.
4. **Fertigstellung**: Neustart-Schritte + Test-Beispiel-Query.

**Backend:** `POST /api/connect/claude-desktop` — erstellt personal-scoped `api_tokens`-Row, schreibt Dual-Audit: `token.created` (matched bestehende Token-UI) + `user.connect.token_created` mit `metadata.clientType` (für „Erstellt via"-Attribution).

**Rate-Limit:** `tokenCreate`-Bucket (10/1h/User), bestehender Bucket.

**Token-Lifecycle:** Tokens aus dem Wizard landen in der normalen Token-Liste unter `/settings/mcp` — ein Pool, zwei Entry-Points. Der Wizard ist der geführte Weg, `/settings/mcp` der Advanced-Weg (Team-Tokens, Raw-Scope-UI).

## ChatGPT / Codex — OAuth-Flow

**Route:** `/connect/chatgpt`

Komplett DCR-basiert — lokri schreibt **keinen** eigenen Registrierungs-Code; Better-Auths MCP-Plugin kümmert sich um alles:

- `/.well-known/oauth-authorization-server` (RFC 8414)
- `/.well-known/oauth-protected-resource` (RFC 9728)
- `/api/auth/mcp/register` (RFC 7591 Dynamic Client Registration)
- `/api/auth/mcp/authorize` + `/api/auth/mcp/token` (PKCE)
- `/api/auth/oauth2/consent`

Die Seite liefert nur die MCP-URL + eine 7-Schritte-Anleitung für die ChatGPT-Custom-Connector-UI. Kein Token zum Kopieren, kein Client-Secret.

**Aktuelle Scope-Limitierung:** OAuth-Tokens in Better-Auths MCP-Plugin unterstützen (noch) keine Space-Scopes. Ein ChatGPT-Connector sieht alle Spaces des autorisierenden Users. Die Seite kommuniziert das prominent über einen Warning-Banner. Feingranulare Scopes für ChatGPT-Connector folgen, sobald die Scope-Erweiterung im Plugin verfügbar ist (Phase 2).

**Voraussetzungen** (ChatGPT-seitig): Pro/Team/Enterprise + Developer-Mode. ChatGPT Plus hat keinen Custom-Connector-Support.

## Team-scoped MCP-Endpoint — `/api/mcp/team/[slug]`

Der reguläre MCP-Endpoint `/api/mcp` läuft immer gegen den **Personal**-
Owner-Account des eingeloggten Users. Wer Team-Connector-Integrationen
(z. B. ein Confluence-Link, der auf dem Team-Account liegt) über Claude
Desktop / Cursor erreichen will, verbindet sich stattdessen mit
`/api/mcp/team/<team-slug>`.

- **Slug:** wird beim Team-Anlegen aus dem Namen abgeleitet
  (`slugifyOwnerAccountName`), immutable — Rename ändert den Slug nicht.
  Sichtbar in der Team-Settings-UI. Kollisionen bekommen numerischen
  Suffix (`empro`, `empro-2`, …). Reservierte Wörter (`api`, `admin`,
  `mcp`, …) werden mit `-team`-Suffix vergeben (`api` → `api-team`).
- **Auth:** gleiche zwei Pfade wie `/api/mcp`.
  - **OAuth 2.1:** User muss Mitglied des Teams sein (`owner_account_members`).
  - **Legacy `lk_`-Bearer:** Token muss für genau diesen Team-Account
    gemintet sein (`apiTokens.ownerAccountId === team.id`).
  - Alle Fehlschläge → 401 mit `WWW-Authenticate`-Hint auf
    `/api/mcp/team/[slug]/oauth-protected-resource` (RFC 9728 per Team).
- **Rate-Limit:** eigener Bucket pro Slug (`team:<slug>`-Prefix), damit
  ein heißes Team ein kaltes nicht verhungern lässt.

**Claude-Desktop-Config** (OAuth, empfohlen):

```json
{
  "mcpServers": {
    "lokri-empro": {
      "command": "/Users/<du>/.nvm/versions/node/v22.x.x/bin/node",
      "args": [
        "/Users/<du>/.nvm/versions/node/v22.x.x/bin/npx",
        "-y", "mcp-remote",
        "https://lokri.io/api/mcp/team/empro"
      ]
    }
  }
}
```

Beim ersten Start öffnet `mcp-remote` den Browser für den OAuth-Flow,
speichert den Access-Token in `~/.mcp-auth/`, und alle folgenden Starts
sind silent. Ein User kann mehrere `mcpServers`-Einträge parallel haben
(Personal + je Team einer) — Claude Desktop verschmilzt die Tool-Listen.

Discovery-Kette:

1. Client fetcht `https://lokri.io/api/mcp/team/empro` ohne Bearer → 401
2. Liest `WWW-Authenticate: resource_metadata="…/oauth-protected-resource"`
3. Fetcht die team-spezifische Metadata → enthält `resource` (URL des
   Team-Endpoints) + gemeinsamen `authorization_servers`-Eintrag
4. Fetcht `https://lokri.io/.well-known/oauth-authorization-server` →
   Better-Auth-gemanagter AS (einer für alle Team-Endpoints)
5. DCR + PKCE gegen `/api/auth/mcp/register` + `/authorize` + `/token`
6. Access-Token an Team-Endpoint — Membership-Check → Tool-Liste

## Token-Management — `/settings/mcp`

Die bestehende Advanced-UI bleibt erhalten und bekommt zwei Erweiterungen:

- **Pointer-Card** an den Anfang: „Neuen Client anbinden" → `/connect`.
- **„Erstellt via"-Badge** pro Token-Row: aus `audit_events`-LEFT-JOIN auf `user.connect.token_created`-Action, Wert aus `metadata.clientType`. Tokens, die ohne Wizard entstanden sind, zeigen kein Badge.

Die alte `McpInstructions`-Card (manuelle Config-Snippets) ist entfernt — der Wizard ist der produktive Weg, redundante Doku wäre Wartungslast.

## Architektur-Eigenschaften

- **Keine Schema-Migration** für das Onboarding: `api_tokens` hatte bereits `name`, `lastUsedAt`, `createdByUserId`. `createdVia` wird aus Audit-Events rekonstruiert, kein Column-Add.
- **Keine Doppellogik** beim Token-Create: `POST /api/connect/claude-desktop` nutzt `lib/tokens.generateApiToken()` + dieselben Validations wie `/api/tokens`, nur mit fixem `scope_type: 'personal'` und Dual-Audit.
- **Security-Contracts statisch geprüft**:
  - `tests/connect-pages.test.ts` scannt die API-Route auf `plaintext`-Erwähnungen (darf nur in einer einzigen `NextResponse.json`-Call auftauchen)
  - Scannt die ChatGPT-Page auf `fetch(` und `<form` (beides verboten — die Seite ist reine Anleitung)

## Roadmap

- **Weitere Clients:** Cursor, Zed, Codex CLI. Framework-vorbereitet via gleiches Pattern (neue `/connect/<client>`-Route + ggf. API-Route, wenn kein OAuth).
- **OAuth-Scope für ChatGPT:** sobald Better-Auths MCP-Plugin Scopes trägt, zweite Auswahl-Stufe vor dem OAuth-Authorize.
- **Token-Expiry:** separates Feature (neues `expires_at`-Column + Runtime-Check in `verifyMcpBearer`). Ersetzt dann das „gültig bis widerrufen"-Pattern.
- **In-App-Connection-Test:** Button „Verbindung testen" in der Token-Liste, der den Endpoint per gespeichertem Token probiert.
