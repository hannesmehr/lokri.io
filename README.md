# lokri.io

Der DSGVO-konforme MCP-Gateway für Power-User, die mehrere KI-Clients (Claude Desktop, ChatGPT, Codex, Cursor) parallel nutzen und einen gemeinsamen, persistenten Wissens- und Datei-Pool wollen — erreichbar über MCP.

> Arbeitstitel. Domain noch nicht gekauft.

## Status

MVP in Aufbau. Noch nicht produktiv nutzbar.

## Tech-Stack

| Bereich | Wahl |
|---|---|
| Framework | Next.js 16 (App Router) |
| Sprache | TypeScript (strict) |
| Hosting | Vercel (EU-Region) |
| Datenbank | Neon Postgres + pgvector (EU) |
| ORM | Drizzle ORM |
| Auth | Better-Auth (Email/Password) |
| Storage | Vercel Blob |
| Embeddings | Vercel AI Gateway (`openai/text-embedding-3-small`, 1536 dim) |
| MCP-Transport | Streamable HTTP (`@modelcontextprotocol/sdk`) |
| MCP-Auth | Bearer-Token |
| UI | shadcn/ui + Tailwind |
| Validierung | Zod |
| Package Manager | pnpm |

## Setup (Stub — wird in späteren Schritten ergänzt)

```bash
pnpm install
cp .env.example .env.local
# Variablen in .env.local ausfüllen
pnpm drizzle-kit push        # Schema anlegen
pnpm dev
```

Benötigte Env-Variablen:

- `DATABASE_URL` — Neon Postgres (mit pgvector-Extension)
- `BETTER_AUTH_SECRET` — zufälliger Secret-String
- `BETTER_AUTH_URL` — z.B. `http://localhost:3000`
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob
- `AI_GATEWAY_API_KEY` — Vercel AI Gateway

## MCP in Claude Desktop / ChatGPT einrichten

Folgt in einem späteren Schritt (Token generieren im Dashboard → Client konfigurieren).

## Roadmap (grob)

- **MVP** — Personal-Accounts, Spaces, Notes, Files, MCP mit Bearer-Token, Vercel-Blob-Storage
- **V1.x** — Sharing, Stripe, OAuth für MCP
- **V2.x** — Team-Workspaces, externe Integrations
- **V3.x** — SSO / SAML

Details siehe `docs/PRODUCT.md` (noch nicht erstellt).

## Lizenz

Noch nicht festgelegt.
