# Security Audit — Viewer Hardening

*Stand: April 2026, nach Teams V1.*
*Fix-Pass abgeschlossen — alle ❌-Einträge haben jetzt `minRole`-Gates.*

Vollständige Bestandsaufnahme aller mutierenden API-Routes + MCP-Tools.
Read-only Endpoints (GET, plus `search`/`fetch`/`list_*`) sind hier nicht
gelistet — für Viewer unkritisch.

**Status-Legende**
- ✅ Korrekt abgesichert
- ❌ Zu offen (Viewer kann mutieren) — in diesem Pass behoben
- ⚠️ Diskussion nötig — entschieden siehe Block unten

---

## Entscheidungen zu den ⚠️-Fällen

1. **Reindex-Operationen** (`POST /api/spaces/[id]/reindex`, `POST
   /api/files/[id]/reindex`) → **`member`**. Inhaltlich Read-Vorgang,
   aber AI-Gateway-Kosten — Viewer dürfen keine Kosten auslösen.
2. **`PATCH /api/spaces/[id]/external/visibility`** → **`admin`**.
   Betrifft team-weite Sichtbarkeit (MCP-Visibility aller Members + das
   space-weite Hidden-Array) — konservativer, weil pro-Member-ACL fehlt.
3. **`GET /api/invoices/[id]/pdf`** → **`owner`**. Rechnungen enthalten
   Preis + Billing-Name + Adresse; konsistent mit den anderen Billing-
   Routes.

---

## REST-Routes

### Content (Notes / Files / Spaces)

| Route | Methode | Aktueller Check | Status |
|---|---|---|---|
| `/api/spaces` | POST | `minRole: 'member'` | ✅ |
| `/api/spaces/[id]` | PATCH | `minRole: 'member'` | ✅ |
| `/api/spaces/[id]` | DELETE | `minRole: 'member'` | ✅ |
| `/api/spaces/[id]/reindex` | POST | `minRole: 'member'` | ✅ |
| `/api/spaces/[id]/external/import` | POST | `minRole: 'member'` | ✅ |
| `/api/spaces/[id]/external/import-batch` | POST | `minRole: 'member'` | ✅ |
| `/api/spaces/[id]/external/visibility` | PATCH | `minRole: 'admin'` | ✅ |
| `/api/notes` | POST | `minRole: 'member'` | ✅ |
| `/api/notes/[id]` | PATCH | `minRole: 'member'` | ✅ |
| `/api/notes/[id]` | DELETE | `minRole: 'member'` | ✅ |
| `/api/files` | POST | `minRole: 'member'` | ✅ |
| `/api/files/[id]` | PATCH | `minRole: 'member'` | ✅ |
| `/api/files/[id]` | DELETE | `minRole: 'member'` | ✅ |
| `/api/files/[id]/reindex` | POST | `minRole: 'member'` | ✅ |
| `/api/import` | POST | `minRole: 'member'` | ✅ |

### Admin-Settings

| Route | Methode | Aktueller Check | Status |
|---|---|---|---|
| `/api/storage-providers` | POST | `minRole: 'admin'` | ✅ |
| `/api/storage-providers/[id]` | DELETE | `minRole: 'admin'` | ✅ |
| `/api/embedding-key` | POST | `minRole: 'admin'` | ✅ |
| `/api/embedding-key` | DELETE | `minRole: 'admin'` | ✅ |

### Tokens

| Route | Methode | Aktueller Check | Status |
|---|---|---|---|
| `/api/tokens` | POST (personal) | `minRole: 'member'` + runtime `canCreateTeamTokens` für `scope_type='team'` | ✅ |
| `/api/tokens/[id]` | DELETE | `minRole: 'member'` | ✅ |

### Billing

| Route | Methode | Aktueller Check | Status |
|---|---|---|---|
| `/api/paypal/create-order` | POST | `minRole: 'owner'` | ✅ |
| `/api/paypal/capture-order` | POST | `minRole: 'owner'` | ✅ |
| `/api/invoices/[id]/pdf` | GET | `minRole: 'owner'` | ✅ |

### Team-Management (bereits in Teams V1 durchdacht)

| Route | Methode | Check | Status |
|---|---|---|---|
| `/api/teams` | POST | `requireSession()` + `can_create_teams` | ✅ |
| `/api/teams/[id]` | PATCH | `minRole: 'admin'` | ✅ |
| `/api/teams/[id]` | DELETE | `minRole: 'owner'` | ✅ |
| `/api/teams/[id]/members/[userId]` | PATCH | `minRole: 'admin'` | ✅ |
| `/api/teams/[id]/members/[userId]` | DELETE | `minRole: 'admin'` | ✅ |
| `/api/teams/[id]/invites` | POST | `minRole: 'admin'` | ✅ |
| `/api/teams/[id]/invites` | GET | `minRole: 'admin'` | ✅ |
| `/api/teams/[id]/invites/[inviteId]` | DELETE | `minRole: 'admin'` | ✅ |
| `/api/invites/accept` | POST | `requireSession()` (User tritt bei) | ✅ |
| `/api/accounts/active` | POST | `requireSession()` + Membership-Check | ✅ |
| `/api/profile/locale` | PATCH | `requireSession()` (self-scoped) | ✅ |

---

## MCP-Tools

| Tool | Mutiert | Guard | Status |
|---|---|---|---|
| `search` | nein | `requireAuth` + `spaceScope` | ✅ |
| `fetch` | nein | `requireAuth` + `spaceScope` | ✅ |
| `list_spaces` / `list_files` / `list_notes` | nein | `requireAuth` + `spaceScope` | ✅ |
| `get_file_content` | nein | `requireAuth` + `spaceScope` | ✅ |
| `summarize_space` | nein | `requireAuth` + `spaceScope` | ✅ |
| `create_note` / `update_note` / `delete_note` | ja | `readOnlyGuard` | ✅ |
| `upload_file` / `delete_file` / `reindex_file` / `update_file` / `move_file` | ja | `readOnlyGuard` | ✅ |

**Warum kein Rollen-Check in den Tools?** Jeder MCP-Token wird über
`/api/tokens` POST erzeugt — und die Route hat jetzt `minRole: 'member'`
(Personal-Tokens) bzw. `canCreateTeamTokens` (`admin+`) für Team-Tokens.
Ein Viewer kann also gar keinen Token minten, mit dem sich Mutationen
ausführen ließen. `readOnlyGuard` bleibt die Runtime-Absicherung; der
Token als Credential ist die Identität, und die Rolle beim Minting die
Zugangskontrolle.

---

## Error-Response-Pattern

Alle Routes fangen `ApiAuthError` und mappen via `authErrorResponse(err)`:

- `err.status === 403` → `forbidden(message, 'forbidden.role')` ⇒ HTTP
  403 mit `{ error, details: { code: 'forbidden.role' } }`
- Sonst → `unauthorized(message)` ⇒ HTTP 401

Clients unterscheiden `401` ("sign in") von `403` ("ask an admin") am
Status; der optionale `details.code` gibt maschinenlesbare Tiefe
(z. B. `forbidden.role` vs. künftige Varianten wie `forbidden.quota`).

---

## Tests

`tests/viewer-hardening.test.ts` (14 Cases): pinnt die capability-
Prädikate (`canCreateSpace`, `canEditContent`, `canManageMembers`,
`canCreateTeamTokens`, `canManageBilling`, `canDeleteTeam`) gegen alle
Rollen, die Hierarchie (`viewer < member < admin < owner`), die
Legacy-Mapping-Regel (`editor → member`, `reader → viewer`,
unbekannt → `viewer`) und die Error-Response-Mapping-Kette
(`ApiAuthError(403) → forbidden() → 'forbidden.role'`). Wenn eine
Route ihren `minRole`-Gate flippt, wäre das ein grober Review-Fehler
und fällt ohnehin sofort im Deploy-Smoke-Test auf; die hier gepinnten
Prädikate garantieren, dass die 18 Routes über **eine** gemeinsame
Wahrheit gehen.

---

## Zusammenfassung

- **18 Routes neu gegated** (17 ❌ + `external/visibility` von member→admin).
- **MCP-Tools**: keine Änderung nötig — Gate sitzt am Token-Minting.
- **23 Tests grün** (inkl. 14 neue Viewer-Hardening + 9 bestehende).
- **Migrations**: keine (rein Code-Änderungen).
