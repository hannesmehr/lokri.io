# Roadmap

Living document — Stand: 18. April 2026.
Fokus: **Features + UX** zuerst, **Design-Politur** am Ende, **Team-Features** danach.
Reihenfolge spiegelt Priorität des Owners.

---

## ✅ Fertig

### 1. Bulk-Reindex (Space-weit)
- Shared Helper `lib/reindex.ts` (`reindexFile(fileRow)`).
- `POST /api/files/[id]/reindex` (single) + `POST /api/spaces/[id]/reindex` (bulk, Cap 100 Files pro Call, `truncated`-Flag).
- Neuer Rate-Limiter `reindex` (5 Calls / 10 min).
- Button „Neu indizieren" im Space-Header (`_reindex-button.tsx`) — Confirm + Loading-Toast + Summary.

### 2. Drag & Drop Upload
- Counter-basiertes `dragDepth`-Tracking im `_bucket-browser.tsx` (kein Flackern).
- Overlay beim Hover, „Upload läuft…"-Badge während des Uploads, Progress-Toast pro Datei.
- Sequenzielle Uploads via `POST /api/files` mit `space_id`.
- **Upload-Bugfix**: externes S3 respektiert jetzt den gebrowsten Prefix (`targetPrefix`-Parameter in `StoragePutInput`), Files landen mit Originalnamen an der richtigen Stelle statt unter `{accountId}/{uuid}-…`.
- Kollisionshandling: gleicher Key überschreibt S3-Objekt + ersetzt Files-Row + Quota wird delta-korrigiert.
- Edge-Case: Ordner-Drops sind (bewusst) nicht rekursiv unterstützt — Hinweis-Toast.

### 3. Command Palette (⌘K)
- Komplett-Umschrift von `_search-palette.tsx` zur echten Commander-Palette.
- Neuer Endpoint `GET /api/palette` (Spaces + letzte 200 Notes + letzte 200 Files, einmal pro Session gecached).
- Eigener Substring-Scorer (`shouldFilter={false}`), drei parallele Quellen in einer Liste:
  1. **Kommandos** — Navigation + Aktionen (Dashboard, New Note, Logout, …) mit Keyword-Aliasen.
  2. **Entities** — direkt springbar nach Name.
  3. **Semantische Suche** — Debounced `/api/search`, erscheint als eigene Gruppe mit Similarity-%.
- Trigger-Label auf „Suchen & Springen…" umgestellt.

### 4. GitHub als read-only Storage-Provider
- Neuer Enum-Wert `github` (Migration 0009).
- `lib/storage/github.ts`: `GitHubProvider` mit Git Trees API (`recursive=1`) für Browsing, `raw.githubusercontent.com` für Content. Unterstützt PAT + public-ohne-Token (IP-Rate-Limit). `put`/`delete` werfen.
- Neue Abstraktion `BrowsableProvider` (+ `loadBrowsableProvider()`). Alle Call-Sites (browse, import, import-batch, object, visibility) hart auf die Abstraktion umgestellt — kein `S3Provider`-Direktzugriff mehr in den Routen.
- Add-Provider-Dialog hat Tab-Switch S3 / GitHub. Verbindungstest vor Speichern für beide Typen.
- Provider-Liste zeigt GitHub-Icon (`FolderGit2` — `Github` existiert im aktuellen lucide nicht) + „read-only"-Badge.
- Bucket-Browser blendet D&D-Zone aus bei read-only, zeigt „read-only"-Label neben dem Provider-Namen.
- Autofill-Fix: `autoComplete="off"` auf allen Nicht-Credential-Feldern (Add-Provider-Dialog, Space-Create, Note-Editor, Token-Create).

### 6. BYO-API-Keys für Embeddings
- Neue Tabelle `embedding_keys` (Migration 0011) mit `provider`-Enum (`openai` für v1), `model`, encrypted `config_encrypted` (AES-256-GCM, gleiche Key-Derivation wie Storage). Unique per `owner_account_id` — ein Key pro Account.
- `lib/embedding-keys.ts`: `getEmbeddingContext(ownerAccountId)` liefert entweder eine `@ai-sdk/openai`-Provider-Instanz (BYOK → direkt zu api.openai.com, Gateway umgangen) oder den Gateway-routed Default `openai/text-embedding-3-small`. `testEmbeddingKey()` macht einen echten Probe-Embed und validiert die Dimension.
- **Modell-Allowlist**: nur 1536-dim-Modelle (`text-embedding-3-small`, `text-embedding-ada-002`) — alles andere würde den pgvector-Index sprengen.
- `lib/embeddings.ts` neu geschrieben: `embedText`/`embedTexts` nehmen jetzt `ownerAccountId?: string` als optionalen zweiten Parameter und routen entsprechend. Backwards-compat für Background-Scripts (ohne Account-Kontext) via Fallback auf Gateway.
- **15 Call-Sites** aktualisiert — MCP-Tools (`search`, `create_note`, `update_note`, `upload_file`, `update_file`), REST-Endpoints (`/api/search`, `/api/notes*`, `/api/files`, `/api/import`), Helper (`reindex.ts`, `space-import.ts`). Jede Anfrage routet jetzt korrekt per Account.
- Endpoint `/api/embedding-key` mit `GET` (Status ohne Key-Offenlegung), `POST` (Test → Encrypt → Persist, Upsert: delete-then-insert), `DELETE`.
- UI unter `/settings/embedding-key` — Status-Alert (BYOK aktiv vs. Gateway-Fallback), Modellwahl, Test-&-Save-Flow, Modellwechsel-Warnung (bestehende Vektoren werden mit neuem Modell inkompatibel → Reindex empfohlen). Sub-Nav in Settings um „Embedding-Key"-Tab ergänzt.
- `last_used_at` wird fire-and-forget auf jedem Embed-Call aktualisiert.

### 5. MCP-Ausbau
#### Tools (neu)
- `reindex_file` — Wrapper um `reindexFile(fileRow)`.
- `update_file` — ersetzt Bytes eines Files in-place, baut Chunks neu, korrigiert Quota.
- `move_file` — ändert `spaceId`, scope-aware.
- `summarize_space` — Markdown-Digest (Notes + Files-Titel + Excerpts). Liefert Text + `structuredContent`.

#### Prompts (registerPrompt)
- `summarize_space` — ruft das Tool + fasst zusammen.
- `triage_notes` — offen / erledigt / veraltet / duplikate.
- `daily_digest` — Tages-Rückschau über alle Spaces + „Was fällt auf?".
- `find_related` — Keyword-Extraktion + Multi-Search.
- Neue Datei `lib/mcp/prompts.ts`.

#### Resources (registerResource)
- `lokri://note/{id}` — text/plain.
- `lokri://file/{id}` — text-MIMEs inline, binär base64.
- `lokri://space/{id}/digest` — text/markdown.
- Jedes mit `list`-Callback, 200-Entry-Cap. Neue Datei `lib/mcp/resources.ts`.

#### Scoped Tokens (Migration 0010)
- Schema-Spalten `api_tokens.space_scope uuid[]` + `read_only boolean`.
- `McpAuthContext` trägt `spaceScope` + `readOnly` durch. OAuth-Tokens defaulten auf `null` / `false` — nur Legacy-Bearer sind scope-fähig.
- Zentrale Helfer in `tools.ts`: `requireAuth`, `scopeCondition(column, scope)`, `readOnlyGuard`, `spaceInScope`.
- **Lese-Tools** filtern SQL-seitig via `IN (scope)`.
- **Mutations-Tools** prüfen `readOnly` + verbieten Account-Level-Operationen für scoped Tokens.
- `resources.ts` analog.
- `POST /api/tokens` akzeptiert `space_scope` + `read_only`; Space-IDs werden gegen den Account geprüft.
- Token-Create-Dialog (`_token-create-dialog.tsx`) hat Tab-Switch „Alle Spaces" / „Nur ausgewählte" + Read-only-Checkbox. Token-Liste zeigt Badges.

---

## 🎯 Als Nächstes

### 7. Mobile-Layout
Dashboard ist aktuell reiner Desktop. Was zu tun ist:
- Top-Nav kollabieren (Burger-Menu), User-Menu in Drawer.
- Space-Browser-Tabelle auf Card-Liste umbauen bei schmaler Breite.
- Notes-Editor / Add-Provider-Dialogs auf volle Screen-Höhe.
- Viewport-Meta ist OK — nur Layout-Arbeit.
- PWA-Manifest als Bonus: `manifest.webmanifest` + Install-Prompt.

### 8. Dark Mode Review
Existierende Farben durchgehen:
- Chart-Palette (oklch) im Dark-Mode prüfen.
- Badges (amber/indigo/emerald) gegen dunklen Hintergrund teilweise zu grell.
- Code-Blöcke + Breadcrumbs Kontrast verbessern.
- `_bucket-browser` Icons hintergrund-Gradients sind für Light designed.

### 9. Keyboard Shortcuts
- `⌘K` steht (Palette).
- Neue Bindings planen:
  - `g n` → Notes, `g s` → Spaces, `g f` → Files, `g h` → Home.
  - `c` auf Notes-Seite → Neue Note.
  - `e` auf einer Note → Edit. `d` → Delete (mit Confirm).
  - `/` → fokussiere Suche in Palette.
- Shortcuts-Overlay bei `?`.

### 10. File-Versionierung
Aktuell: Reindex / Re-Upload löscht alte Chunks hart. Besser:
- Neue Tabelle `file_versions` mit Referenz auf `files.id`, eigene `storage_key`, `size_bytes`, `created_at`.
- Bei jedem Re-Upload: alte Version bleibt (N-Limit per Account, z.B. 5 Versionen).
- UI: History-Ansicht pro File mit Restore-Button.
- Download-Route bekommt `?version=N` Parameter.
- Quota-Buchhaltung muss alle Versionen zählen.

### 11. Papierkorb statt Hard-Delete
- Spalte `deleted_at timestamptz` auf `notes` + `files`.
- Alle Queries (+ MCP, REST) filtern auf `deleted_at IS NULL` (plus explizite Trash-Queries).
- Delete setzt nur `deleted_at`, Quota bleibt belastet bis endgültiges Delete.
- Neue Settings-Page „Papierkorb" mit Restore + „Endgültig löschen".
- Cron: Einträge älter als 30 Tage hart löschen (inkl. Storage-Delete).

### 12. Empty-States mit CTAs
Durch die Seiten gehen:
- `/spaces` leer → „Create your first space" mit großem Button statt dünnem Text.
- `/notes` leer → „Erste Note schreiben" → `/notes/new`.
- `/files` leer → Drop-Zone sichtbar machen.
- `/settings/storage` nur mit Default → Illustrierter Pointer auf „Neuer Provider".
- `/billing` ohne Invoices → „Noch keine Rechnungen" mit Hint auf Plans.

---

## 👥 Team-Features (eigener Block)

Daten-Modell liegt bereit (`owner_account_members` + `owner_account_member_role`-Enum), ist aber nicht angebunden.

- Einladungs-Flow: Token-basierte Invite-Links via Email (Resend), Accept-Page mit Sign-up-or-Sign-in.
- Rollen: owner / admin / member / viewer — Berechtigungs-Matrix dokumentieren.
- `requireSessionWithAccount` erweitern: aktueller User muss Mitglied sein + Mindest-Rolle checken.
- Account-Switcher im User-Menu (falls User in mehreren Accounts).
- Audit-Log-Tabelle für B2B-Anforderungen.
- Shared Spaces mit per-Space-ACL (`space_members` existiert bereits).
- Team-Billing / Seats — eigene Plan-Variante.

---

## 🔌 Obsidian-Plugin (später)

**Warum**: Beste Akquise für die Zielgruppe. Obsidian-Community-Store, null Cert-Aufwand.

Scope v1:
- Settings: lokri-URL + Token + Default-Space.
- Command: „Upload Active Note to lokri" → `POST /api/notes` oder `upload_file`.
- Sync: Watchers auf Vault-Events (create / modify / delete) → debounced upload. Konflikt-Handling offen.
- Command: „Search lokri" → Palette mit Ergebnissen, Klick öffnet in Browser.

Fortsetzung v2:
- Bidirektional: lokri-Notes als synthetische Obsidian-Notes mountbar.
- lokri als Backlink-Ziel — Obsidian-Link `[[lokri://note/id]]`.

---

## 💅 Design-Politur (ganz am Ende)

User sagt: „Design gefällt mir insgesamt noch nicht so richtig — aber erst wenn Features stehen."

Mögliche Richtungen für später:
- Typografie-Pass: Display-Font-Weights, Heading-Hierarchie konsistent.
- Farbsystem ggf. neu: aktuell oklch-Palette, teils kitschig bei kleinen Icons.
- Empty-States illustrieren (statt nur Text).
- Loading-Skeletons statt Spinner.
- Transitions (page, dialog-open, palette) ruhiger.
- Marketing-Seite komplett neu (aktuell Coming-Soon-Stub).

---

## 🧊 Parking Lot (angesprochen, nicht priorisiert)

### Search-Qualität
- **OCR** für gescannte PDFs (Mistral OCR / Tesseract als Fallback bei <N Zeichen Extraktion).
- **Hybrid Search** (BM25 `tsvector` + pgvector).
- **Reranker** (Voyage / Cohere) auf Top-20 → Top-5.
- **Query-Rewriting** vorm Embedding.
- **Citations** / Snippet-Highlighting.
- **Cross-Space vs. Space-Scope** via MCP-Tool-Arg.

### Dateitypen
- XLSX / CSV / Markdown / HTML / EPUB / .eml.

### Storage-Provider
- Google Drive (Picker API → keine CASA-Verification nötig).
- Dropbox (Chooser oder Full-Production-Review).
- OneDrive / Microsoft Graph (Publisher Verification + File Picker v8).
- WebDAV (Nextcloud, iCloud via Bridges).
- IMAP/Email-Ingestion (`<account>@in.lokri.io`).

### Automation
- Auto-Ingest via S3-Webhook.
- Scheduled Reindex (Cron).
- Background-Jobs-Queue (Inngest o.ä.) statt inline — große Uploads blockieren aktuell den Request.

### DSGVO-Killerfeatures
- Datenexport (Takeout-ZIP, Files + Notes + Chunks als JSON).
- AVV-PDF generierbar pro Account.
- Retention Policies (auto-delete nach X).
- EU-Region-Pinning dokumentieren.
- PII-Redaction (optional pre-embedding).
- Subprocessor-Liste + Changelog mit Email-Notify.

### Monetarisierung
- Echte Abos (monatlich / jährlich).
- Usage-based Billing (GB, Embedding-Calls).
- Trial-Periode.
- Affiliate-Programm.

### Dev-Experience
- OpenAPI-Spec + SDK-Generation (TS / Python).
- CLI (`lokri push ./docs/`).
- Public Docs-Site getrennt von Marketing.
- Tests — Unit (Quota, Encryption, Import), E2E (Playwright).
- Sentry.
- Staging-Environment via Vercel-Preview + separate Neon-Branch.

---

## 🗒️ Bekannte Technical Debts

- `_bucket-browser.tsx`, `_search-palette.tsx`, `billing/success/page.tsx`: 4 Pre-existing Lint-Errors (React-Hooks: `preserve-manual-memoization` + `set-state-in-effect`). Nicht blockierend — sollten bei nächstem Refactor mitgemacht werden.
- `lib/storage/index.ts` hat einen `_ownerAccountId`-Parameter in `loadStorageContext` (deprecated shim) — kann weg, sobald niemand mehr die alte Signatur importiert.
- `lib/storage/index.ts` hat deprecated Shim-Funktionen (`getStorageProvider`, `getCurrentStorageProvider`, `getStorageProviderForFile`) — Suche nach Call-Sites und entfernen.
- Upload-Pfad ist inline — große PDFs blockieren den Next.js-Request. Sollte bei „Background-Jobs-Queue" oben mitgelöst werden.

---

## 📁 Wo die Arbeit liegt (Schnell-Map)

| Bereich               | Datei / Pfad                                                          |
| --------------------- | --------------------------------------------------------------------- |
| MCP Tools             | `lib/mcp/tools.ts`                                                    |
| MCP Prompts           | `lib/mcp/prompts.ts`                                                  |
| MCP Resources         | `lib/mcp/resources.ts`                                                |
| MCP Auth              | `lib/mcp/auth.ts`                                                     |
| MCP HTTP-Entry        | `app/api/mcp/route.ts`                                                |
| Storage Abstraktion   | `lib/storage/index.ts` (+ `s3.ts`, `github.ts`, `vercel-blob.ts`)     |
| Space-Browser (UI)    | `app/(dashboard)/spaces/[id]/_bucket-browser.tsx`                     |
| Space-Browser (API)   | `app/api/spaces/[id]/browse/route.ts`                                 |
| External Import       | `lib/space-import.ts`, `app/api/spaces/[id]/external/import*/`        |
| Reindex Helper        | `lib/reindex.ts`                                                      |
| Command Palette       | `app/(dashboard)/_search-palette.tsx`, `app/api/palette/route.ts`     |
| Add-Provider-Dialog   | `app/(dashboard)/settings/storage/_add-provider-dialog.tsx`           |
| Token-Create-Dialog   | `app/(dashboard)/settings/mcp/_token-create-dialog.tsx`               |
| Embedding BYOK        | `lib/embedding-keys.ts`, `lib/embeddings.ts`                          |
| Embedding-Key API     | `app/api/embedding-key/route.ts`                                      |
| Embedding-Key UI      | `app/(dashboard)/settings/embedding-key/`                             |
| Schema                | `lib/db/schema.ts`                                                    |
| Migrations            | `drizzle/000*_*.sql` (aktuell bis 0011)                               |

---

## 📅 Letzter Stand der Discussion

- User bestätigte Reihenfolge: #1–3 Polish, #4 GitHub, MCP vorgezogen, danach #6–#12.
- Team-Features danach, Obsidian-Plugin später, Design-Pass ganz am Ende.
- **#6 BYO-API-Keys ist fertig** (Migration 0011, UI unter `/settings/embedding-key`).
- Nächster Task wäre **#7 Mobile-Layout**.
