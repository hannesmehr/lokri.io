# lokri.io

Der DSGVO-konforme MCP-Gateway für Power-User, die mehrere KI-Clients (Claude
Desktop, ChatGPT, Codex, Cursor) parallel nutzen und einen gemeinsamen,
persistenten Wissens- und Datei-Pool wollen — erreichbar über das Model
Context Protocol.

> Arbeitstitel. Domain noch nicht gekauft. MVP-Phase.

## Features (MVP)

- **Spaces** — gruppiere Notes und Files thematisch
- **Notes** — Markdown/Plaintext, automatisch semantisch indiziert
- **Files** — 10 MB/File, private Vercel-Blob-Storage, Textinhalt wird
  gechunked und embedded
- **Semantische Suche** über alle Notes und File-Chunks (pgvector, HNSW,
  Cosine)
- **MCP-Endpoint** mit Bearer-Token — 10 Tools (`search`, `fetch`,
  `list_spaces`, `list_files`, `list_notes`, `create_note`, `update_note`,
  `delete_note`, `upload_file`, `delete_file`)
- **Email/Passwort-Auth** (Better-Auth) mit Email-Verification
- **Quota** pro Account, atomar getrackt (Free: 20 MB · 100 Files · 500 Notes)

## Tech-Stack

| Bereich | Wahl |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Sprache | TypeScript (strict) |
| Hosting | Vercel (EU-Region empfohlen) |
| Datenbank | Neon Postgres + pgvector |
| ORM | Drizzle ORM |
| Auth | Better-Auth (Email/Password) |
| Storage | Vercel Blob (`access: private`) |
| Embeddings | Vercel AI Gateway · `openai/text-embedding-3-small` (1536 dim) |
| MCP-Transport | Streamable HTTP · `@modelcontextprotocol/sdk` + `mcp-handler` |
| MCP-Auth | Bearer-Token (bcrypt-Hash in DB) |
| UI | shadcn/ui (base-nova) + Tailwind v4 |
| Validierung | Zod |
| Package Manager | pnpm |

## Setup

### Voraussetzungen

- Node.js **≥ 22**
- pnpm **≥ 8**
- Neon-Account (oder ein anderes Postgres mit `pgvector`-Extension)
- Vercel-Account mit **Blob Store** + **AI Gateway**

### Installation

```bash
pnpm install
cp .env.example .env.local
# .env.local mit deinen Werten füllen (siehe unten)
pnpm db:migrate     # Tabellen anlegen + pgvector aktivieren
pnpm db:seed        # Free-Plan-Row einfügen
pnpm dev            # http://localhost:3000
```

### Environment-Variablen

Alle gehen in `.env.local` (lokal) bzw. Vercel-Project-Settings (Deploy).

| Variable | Wo / wie | Pflicht? |
|---|---|---|
| `DATABASE_URL` | Neon-Connection-String (`?sslmode=require&channel_binding=require`) | ja |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` — pro Environment einmalig generieren | ja |
| `BETTER_AUTH_URL` | `http://localhost:3000` (dev) bzw. deine Prod-URL | ja |
| `BLOB_READ_WRITE_TOKEN` | Vercel → Storage → Blob Store anlegen → Token | ja für Uploads |
| `AI_GATEWAY_API_KEY` | Vercel → AI Gateway → Create Key | ja für Embeddings |

### Scripts

```bash
pnpm dev              # Dev-Server
pnpm build            # Production-Build
pnpm start            # Production-Server starten
pnpm lint             # ESLint
pnpm db:generate      # Drizzle-Migration aus Schema-Änderung erzeugen
pnpm db:migrate       # Migrations anwenden
pnpm db:push          # Schema direkt pushen (nur Dev)
pnpm db:studio        # Drizzle Studio
pnpm db:seed          # Free-Plan seeden
```

## MCP in KI-Clients einrichten

1. Im Dashboard unter **Settings → MCP-Tokens** einen neuen Token anlegen.
2. Den Plaintext kopieren (wird nur einmal angezeigt).
3. Im Client entsprechend eintragen:

### Claude Desktop

lokri implementiert **OAuth 2.1** inkl. Dynamic Client Registration (RFC 7591)
und PKCE. Claude Desktop's Config-Schema akzeptiert in der aktuellen
Release-Version (Q2 2026) allerdings **keine HTTP-Einträge direkt** — du
brauchst weiterhin die stdio-Bridge
[`mcp-remote`](https://www.npmjs.com/package/mcp-remote). Der Unterschied
zu vorher: **kein manueller Token mehr**, `mcp-remote` erledigt den
OAuth-Flow automatisch.

```bash
npm install -g mcp-remote
```

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
bzw. `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "lokri": {
      "command": "/absolute/path/to/node",
      "args": [
        "/absolute/path/to/mcp-remote",
        "https://your-lokri-domain/api/mcp"
      ]
    }
  }
}
```

Beim ersten Start triggert `mcp-remote` den OAuth-Flow: Browser öffnet sich,
User loggt sich bei lokri ein, gibt Consent, Token wird gecacht in
`~/.mcp-auth/`. Ab dann läuft alles silent. Logs:
`~/Library/Logs/Claude/mcp-server-lokri.log`.

**Achtung nvm-Nutzer:** Claude Desktop erbt den Login-Shell-PATH, aber nvm
sortiert Versionen nicht chronologisch. Nutze absolute Pfade zu Node 22+
und zum `mcp-remote`-Binary (nicht `npx`).

**Discovery unter der Haube:**

1. `POST /api/mcp` → 401 mit
   `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource"`
2. `GET /.well-known/oauth-protected-resource` → listet den Authorization
   Server
3. `GET /.well-known/oauth-authorization-server` → liefert
   `authorization_endpoint`, `token_endpoint`, `registration_endpoint`,
   `code_challenge_methods_supported: ["S256"]`
4. `POST /api/auth/mcp/register` → registriert den Client dynamisch
5. OAuth Authorization-Code-Flow mit PKCE

### ChatGPT

ChatGPTs "Developer Tools → MCP Connectors" unterstützt HTTP-Endpoints mit
Bearer-Token nativ:

- **URL**: `https://your-lokri-domain/api/mcp`
- **Auth**: Bearer Token (dein `lk_...`)
- Pflicht-Tools `search` und `fetch` sind implementiert

### Cursor

`~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "lokri": {
      "url": "https://your-lokri-domain/api/mcp",
      "headers": {
        "Authorization": "Bearer lk_DEIN_TOKEN"
      }
    }
  }
}
```

Cursor neu starten.

### Codex / andere Clients

Alles was Streamable-HTTP-MCP mit Bearer-Header unterstützt, funktioniert
analog zu Cursor.

## Architektur (Kurz)

```
┌──────────────┐   Bearer      ┌──────────────────┐   Drizzle      ┌────────┐
│  MCP-Client  │──────────────▶│  /api/mcp        │───────────────▶│ Neon + │
│ (Claude, …)  │               │  (stateless HTTP)│                │ pgvec  │
└──────────────┘               │  Tools: 10       │                └────────┘
                               │                  │   @vercel/blob  ┌────────┐
┌──────────────┐   Cookie      │  /api/spaces     │────────────────▶│ Blob   │
│  Web-UI      │──────────────▶│  /api/notes      │    (private)    │ Store  │
│ (Next.js SSR)│               │  /api/files      │                 └────────┘
└──────────────┘               │  /api/tokens     │
                               │  /api/search     │   ai SDK        ┌────────┐
                               │  /api/auth/[...] │────────────────▶│ AI     │
                               └──────────────────┘                 │Gateway │
                                                                    └────────┘
```

- **Owner-Account-Layer**: alles hängt an `owner_accounts` (type=`personal`
  im MVP) — vorbereitet für Teams in V2, ohne sie zu aktivieren
- **Bearer-Token-Verification**: Prefix-Lookup (`token_prefix` indiziert)
  + `bcrypt.compare` auf Treffer → O(1) im Normalfall
- **File-Downloads** gehen immer über `/api/files/[id]/content` (Session-
  geschützt); Vercel-Blob-URLs werden nie an Clients exposed

## Roadmap

- **V1.1** — Mailer (Resend/Postmark) statt Console-Log · Such-UI · Email-
  Verification-Page
- **V1.2** — Stripe-Integration: Paid-Tiers (100 MB · 1 GB · 10 GB)
- **V1.3** — Space-Sharing per Link / Invite
- **V1.4** — OAuth 2.1 am MCP-Endpoint → kein `mcp-remote`-Wrapper mehr
  für Claude Desktop nötig
- **V2.0** — Team-Workspaces aktivieren (Datenmodell steht bereits)
- **V2.x** — Externe Integrations (Notion, Slack, …) · BYO-Bucket (S3, R2)
- **V3.x** — SSO/SAML

## Explizit nicht im MVP

Keine Versionierung von Files/Notes. Kein Marketplace. Keine OAuth-Flows
für MCP (Bearer reicht). Keine Team-Workspaces in der UI. Kein SSO.

## Lizenz

Noch nicht festgelegt.
