# Claude Code Prompt: lokri.io MVP-Setup

Hi Claude. Wir starten ein neues SaaS-Projekt namens **lokri.io**. In diesem ersten Schritt geht es um:

1. Produktkonzept-Dokument schreiben
2. Git-Repo vorbereiten
3. Projekt-Grundgerüst aufsetzen (Next.js + TypeScript + Better-Auth + Neon + Vercel Blob)
4. Datenbank-Schema implementieren
5. Erste API-Routes (CRUD für Spaces, Notes, Files)
6. MCP-Server-Endpoint mit Bearer-Token-Auth (Streamable HTTP)
7. Minimale Web-UI zum Testen (shadcn/ui)

Bitte arbeite Schritt für Schritt und stoppe nach jedem Schritt zur Bestätigung — nicht alles auf einmal durchziehen.

---

## Produktkonzept (Kontext für dich)

**Was ist lokri.io?**

Ein DSGVO-konformer MCP-Gateway für Power-User, die mehrere KI-Clients (Claude Desktop, ChatGPT, Codex, Cursor) parallel nutzen und einen gemeinsamen, persistenten Wissens- und Datei-Pool haben wollen, der über MCP von allen Clients erreichbar ist.

**Positionierung in einem Satz:** Der DSGVO-konforme MCP-Gateway für deutschsprachige KMU und Power-User, die ihren eigenen Storage mitbringen können und eine UI haben wollen, die nicht nach Open-Source-Dashboard aussieht.

**Zielgruppe MVP:** B2C / Solo-Power-User. Tech-affine Leute, die Claude.ai und ChatGPT parallel nutzen und genervt davon sind, dass Memory in jedem Tool isoliert ist.

**Differenzierung gegenüber Wettbewerb:**
- vs. Mem0: Wir sind Endprodukt, nicht Developer-Library
- vs. OpenMemory: Wir sind EU-hosted (DSGVO), Files-First (nicht nur Memories)
- vs. Onoma: Wir verbinden bestehende KI-Clients via MCP, sind kein eigenes Chat-Frontend
- vs. Self-hosted Lösungen (mcp-memory-service etc.): Wir haben eine UI, die nicht nach Open-Source aussieht; kein Docker-Setup nötig

**Geschäftsmodell:** Freemium. 20 MB free, später bezahlte Tiers (100 MB / 1 GB / 10 GB). Kein Token-Bundling — wir verkaufen Storage + Service, nicht LLM-Calls.

---

## Tech-Stack (verbindlich)

| Bereich | Wahl |
|---|---|
| Framework | Next.js 15 (App Router) |
| Sprache | TypeScript (strict) |
| Hosting | Vercel (EU-Region, später konfigurieren) |
| Datenbank | Neon Postgres mit pgvector-Extension (EU) |
| ORM | Drizzle ORM |
| Auth | Better-Auth |
| Storage (MVP) | Vercel Blob |
| Embeddings | Vercel AI Gateway, default `openai/text-embedding-3-small` (1536 Dimensionen) |
| MCP-Transport | Streamable HTTP (offizielles `@modelcontextprotocol/sdk`) |
| MCP-Auth | Bearer-Token (statisch, im User-Dashboard generierbar) |
| UI | shadcn/ui auf Tailwind |
| Validierung | Zod |
| Package Manager | pnpm |

**Bitte NICHT verwenden:** Clerk, Auth0, Supabase Auth, Prisma, MUI, Bootstrap.

---

## Datenmodell (verbindlich)

Wichtig: Wir bereiten Teams für V2 vor, ohne sie im MVP zu aktivieren. Alles, was später einem User ODER einer Organization gehören könnte, hängt an einem `accounts`-Layer.

### Tabellen

**Better-Auth-Standard-Tabellen:**
- `users`, `sessions`, `accounts` (Better-Auth-Naming) — Achtung Namens-Konflikt: Better-Auth hat eine eigene `accounts`-Tabelle für OAuth-Provider. Bitte unsere Account-Tabelle als `owner_accounts` benennen, um Konflikte zu vermeiden.

**Eigene Tabellen:**

- `owner_accounts`
  - id (uuid, pk)
  - type (enum: `personal` | `team`) — im MVP immer `personal`
  - name (text)
  - plan_id (fk → plans)
  - created_at

- `owner_account_members` — n:m zwischen User und owner_account
  - id, owner_account_id, user_id, role (enum: `owner` | `editor` | `reader`), joined_at
  - Im MVP hat jeder Personal-Account genau einen Member (den User selbst, Rolle `owner`)

- `plans`
  - id (text, pk, z.B. `free`, `starter`, `pro`)
  - name, max_bytes, max_files, max_notes, price_eur_monthly
  - Im MVP nur `free` einseed: 20 MB, 100 Files, 500 Notes, 0 EUR

- `api_tokens`
  - id, owner_account_id, name (z.B. "Claude Desktop"), token_hash (bcrypt o.ä.), token_prefix (für UI-Anzeige, z.B. `lk_abc...`), last_used_at, created_at, revoked_at

- `spaces`
  - id, owner_account_id, name, description, created_at, updated_at

- `space_members` — Vorbereitung für Sharing in V1.3
  - id, space_id, owner_account_id, role (`owner` | `editor` | `reader`), added_at
  - Im MVP wird beim Space-Create automatisch ein Eintrag mit Rolle `owner` angelegt

- `files`
  - id, owner_account_id, space_id (nullable), filename, mime_type, size_bytes, storage_provider (text, default `vercel_blob`), storage_key, created_at

- `file_chunks`
  - id, file_id, chunk_index (int), content_text (text), embedding (vector(1536)), embedding_model (text)

- `notes`
  - id, owner_account_id, space_id (nullable), title, content_text, embedding (vector(1536)), embedding_model (text), created_at, updated_at

- `usage_quota` — pro owner_account
  - owner_account_id (pk), used_bytes, files_count, notes_count, updated_at

### Indizes

- HNSW-Indizes auf `file_chunks.embedding` und `notes.embedding` (cosine)
- B-Tree-Indizes auf allen Foreign Keys
- Unique-Index auf `api_tokens.token_hash`

---

## MCP-Tools (verbindlich)

Der MCP-Server muss diese Tools implementieren. Wichtig: `search` und `fetch` sind Pflicht für ChatGPT-Kompatibilität.

**Pflicht-Tools (ChatGPT-Konvention):**
- `search(query: string, limit?: number)` — semantische Suche über alle Files+Notes des Accounts. Returns: `{ ids: string[] }`
- `fetch(id: string)` — eine Note oder ein File-Chunk per ID abrufen. Returns: `{ id, type, title, content, metadata }`

**Hauptfunktionen:**
- `list_spaces()` — alle Spaces des Accounts
- `list_files(space_id?: string, limit?: number)` — Files in einem Space oder global
- `list_notes(space_id?: string, limit?: number)` — Notes in einem Space oder global
- `create_note({ title, content, space_id? })` — neue Note. Quota-Check.
- `update_note({ id, title?, content? })`
- `delete_note(id)`
- `upload_file({ filename, content_base64, mime_type, space_id? })` — Quota-Check, Größenlimit ~10 MB pro Datei
- `delete_file(id)`

Alle Tool-Inputs sind Zod-validiert. Outputs sind kompakt (Token-effizient).

---

## Auth-Flow

**Web-UI:**
- Better-Auth mit Email/Passwort
- Email-Verification aktiv
- Cookie-basierte Sessions
- Beim Register wird automatisch ein `owner_account` (type=`personal`) angelegt + ein `owner_account_members`-Eintrag

**MCP:**
- Bearer-Token im `Authorization: Bearer lk_xxx` Header
- Token wird in `api_tokens` als bcrypt-Hash gespeichert
- Bei jedem MCP-Request: Token-Hash-Lookup → owner_account_id → alle Operationen scoped auf diesen Account
- Im User-Dashboard: Tokens generieren, benennen, widerrufen
- Mehrere Tokens pro Account erlaubt (für verschiedene Clients)

---

## Verzeichnisstruktur (Vorschlag)

```
lokri/
├── app/
│   ├── (auth)/login, register
│   ├── (dashboard)/spaces, files, notes, settings
│   ├── api/
│   │   ├── auth/[...all]/route.ts (Better-Auth)
│   │   ├── spaces/, notes/, files/, tokens/, search/
│   │   └── mcp/route.ts (Streamable HTTP MCP)
│   └── layout.tsx
├── components/ui/ (shadcn)
├── lib/
│   ├── db/schema.ts (Drizzle Schema)
│   ├── db/index.ts (DB-Client)
│   ├── auth.ts (Better-Auth-Config)
│   ├── storage/ (StorageProvider-Interface + VercelBlobProvider)
│   ├── embeddings.ts (Vercel AI Gateway)
│   ├── quota.ts (Quota-Enforcement)
│   └── mcp/ (MCP-Server-Setup, Tool-Definitionen)
├── drizzle/ (Migrations)
├── docs/
│   └── PRODUCT.md (das Produktkonzept, das du in Schritt 1 schreibst)
├── .env.example
├── README.md
└── package.json
```

---

## Aufgaben — bitte Schritt für Schritt

### Schritt 1: Produktkonzept

Erstelle `docs/PRODUCT.md` mit folgender Struktur:

- Was ist lokri.io? (1-2 Absätze)
- Problem & Zielgruppe
- Positionierung & Differenzierung
- MVP-Scope (was drin, was draußen)
- Roadmap (V1.1, V1.2, V1.3, V1.4, V2.0, V2.x, V3.x — mit Features-Übersicht)
- Geschäftsmodell
- Tech-Stack-Übersicht
- Wettbewerbslandschaft (kurz)

Stoppe nach diesem Schritt und zeige mir den Inhalt zur Freigabe.

### Schritt 2: Git-Repo vorbereiten

- `git init`
- `.gitignore` für Next.js + Node + macOS
- `README.md` mit Kurzbeschreibung, Setup-Anleitung-Stub, Tech-Stack
- Erster Commit: `chore: initial repo setup`

Stoppe und melde, dass das Repo bereit ist.

### Schritt 3: Next.js-Projekt aufsetzen

- `pnpm create next-app@latest .` mit TypeScript, Tailwind, App Router, ESLint, src-Verzeichnis NEIN, Turbopack JA
- shadcn/ui initialisieren: `pnpm dlx shadcn@latest init` (Style: New York, Color: Neutral)
- Drizzle, Better-Auth, Vercel Blob, Vercel AI Gateway SDK, MCP SDK, Zod installieren
- `.env.example` mit allen nötigen Variablen anlegen (DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, BLOB_READ_WRITE_TOKEN, AI_GATEWAY_API_KEY)
- Commit: `chore: scaffold next.js with core dependencies`

Stoppe und zeige `package.json`.

### Schritt 4: Datenbank-Schema

- Drizzle-Schema in `lib/db/schema.ts` für alle oben definierten Tabellen
- pgvector-Erweiterung als Migration
- Drizzle-Config + Migration-Script
- Seed-Script, das den `free` Plan einfügt
- Commit: `feat: database schema with pgvector`

Stoppe und zeige Schema-Datei.

### Schritt 5: Better-Auth-Integration

- `lib/auth.ts` mit Email/Password-Provider, Email-Verification (initial: Console-Logger als Mailer-Stub)
- Hook beim User-Create: automatisch `owner_account` (type=`personal`) + `owner_account_members` mit Rolle `owner` anlegen
- API-Route `app/api/auth/[...all]/route.ts`
- Login/Register-Pages unter `app/(auth)/`
- Commit: `feat: authentication with better-auth`

Stoppe und zeige Auth-Setup.

### Schritt 6: Storage-Abstraktion

- Interface `StorageProvider` in `lib/storage/types.ts`
- `VercelBlobProvider` in `lib/storage/vercel-blob.ts`
- Factory-Funktion `getStorageProvider(account)` (im MVP immer Vercel Blob)
- Commit: `feat: storage abstraction with vercel blob`

### Schritt 7: Embedding-Service

- `lib/embeddings.ts` mit Funktion `embed(text: string)` über Vercel AI Gateway
- Default-Modell `openai/text-embedding-3-small`
- Chunking-Helper für längere Texte (500-1000 Tokens pro Chunk, mit kleinem Overlap)
- Commit: `feat: embeddings via vercel ai gateway`

### Schritt 8: REST-API für Web-UI

- CRUD-Routes für `spaces`, `notes`, `files` unter `app/api/`
- Token-Management-Routes unter `app/api/tokens/`
- Suche unter `app/api/search/`
- Quota-Enforcement in einem Helper `lib/quota.ts`, von allen Mutationen aufgerufen
- Zod-Schemas für alle Inputs
- Commit: `feat: rest api for web ui`

### Schritt 9: MCP-Server

- `app/api/mcp/route.ts` mit Streamable HTTP via `@modelcontextprotocol/sdk`
- Bearer-Token-Auth-Middleware
- Alle in der Spec definierten Tools implementieren (search, fetch, list_*, create_note, update_note, delete_note, upload_file, delete_file)
- Tools rufen denselben Quota-Helper auf wie die REST-API
- Commit: `feat: mcp server with streamable http`

### Schritt 10: Minimale Web-UI

- Login/Register funktionsfähig
- Dashboard mit Quota-Übersicht
- Spaces-Liste + Create-Dialog
- Notes-Liste pro Space + Editor (simpel, Textarea)
- Files-Upload pro Space (Drag&Drop oder File-Input)
- Settings → "MCP-Verbindung": Token generieren + Anleitung mit Copy-Buttons für Claude Desktop und ChatGPT
- Commit: `feat: minimal web ui`

### Schritt 11: README finalisieren

- Setup-Anleitung
- Anleitung "MCP in Claude Desktop einrichten"
- Anleitung "MCP in ChatGPT einrichten"
- Roadmap-Hinweis
- Commit: `docs: complete readme`

---

## Wichtige Konventionen

- **Code-Stil:** Funktionale Patterns wo sinnvoll, keine Klassen-Hierarchien
- **Fehlerbehandlung:** Errors via Zod-Schemas, einheitliche API-Error-Responses
- **Naming:** snake_case in der Datenbank, camelCase in TypeScript
- **Kommentare:** Nur wenn nötig; Code soll selbsterklärend sein
- **Tests:** Im MVP nur für `lib/quota.ts`, `lib/embeddings.ts` (chunk function), Token-Hashing
- **Commits:** Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`)
- **Sprache:** Code & Kommentare auf Englisch, User-facing Texte (UI, Emails, Doku) in Deutsch UND Englisch — die i18n-Library kann später kommen, vorerst Strings als Constants in `lib/i18n/de.ts` und `lib/i18n/en.ts` mit deutscher Default-Locale

---

## Was du NICHT tun sollst

- Keine Vercel-Deployments triggern, kein `vercel deploy`
- Keine Domain-Setup-Schritte (lokri.io ist nur Arbeitstitel, Domain noch nicht gekauft)
- Keine Stripe-Integration (kommt erst V1.2)
- Keine Sharing-Links bauen (gestrichen)
- Keine Versionierung von Files/Notes
- Keinen Marketplace, keine externen Integrations (Notion, Slack etc.) — kommt V2.x
- Keine OAuth-Flows für MCP (kommt V1.4) — Bearer-Tokens reichen
- Keine Team-Workspaces aktivieren (UI bleibt Personal-Only — Datenmodell steht aber bereit)
- Kein SSO, keine SAML-Konfiguration (V3.x)

---

Los geht's mit Schritt 1. Bitte stoppe nach jedem Schritt und warte auf meine Freigabe.
