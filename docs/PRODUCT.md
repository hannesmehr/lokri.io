# lokri.io — Produkt

Kurze, funktionale Beschreibung dessen, was lokri aktuell tut. Technische
Details gehören ins Repo-README bzw. die Code-Kommentare; hier stehen nur
Konzepte und Flows.

## Kern

lokri.io ist ein DSGVO-konformer MCP-Gateway für Power-User mit mehreren
KI-Clients (Claude Desktop, ChatGPT, Cursor, Codex). Alles, was der User
ablegt — Notes, Files aus eigenen S3-Buckets oder GitHub-Repos — wird
chunked, embedded und über MCP als `search` / `fetch` / `list_*` /
`create_note` / `upload_file` durchsuch- und manipulierbar gemacht.

### Mehrsprachigkeit

Die Weboberfläche ist in **Deutsch (Default) + Englisch** verfügbar.
Sprachwahl via Profil (persistiert in `users.preferred_locale`); ohne
User-Präferenz fällt die Erkennung auf das `lokri-locale`-Cookie, dann
auf den `Accept-Language`-Header zurück. Keine URL-Prefixes. Emails
werden in der Sprache des Empfängers geschickt.

Impressum und Datenschutzerklärung liegen aus rechtlichen Gründen **nur
auf Deutsch** vor.

### Entitäten

- **Owner-Account** — Tenancy-Grenze. Personal (ein User) oder Team (siehe
  unten).
- **Spaces** — thematische Gruppen innerhalb eines Accounts. Ein Space
  kann einem Storage-Provider zugewiesen sein.
- **Notes** — Markdown/Plaintext, ein Embedding pro Note.
- **Files** — binäre oder textuelle Dateien. Textuelle werden chunked
  und per Chunk embedded. 10 MB Per-File-Limit.
- **Storage-Provider** — Vercel Blob (intern, Default), BYO-S3
  (R2/B2/AWS/Wasabi/MinIO), GitHub-Repo (read-only).
- **Embedding-Key** — optionaler BYO-Key für OpenAI. Wenn gesetzt, wird
  die Vercel AI Gateway umgangen.

### Plans

Free / Starter / Pro / Business sind Einzel-Account-Pläne mit festen
Storage-Grenzen und One-Time-Captures (PayPal). Siehe `README.md` und
`lib/db/seed.ts`.

---

## Teams

Seit V1 unterstützt lokri **Team-Accounts** zusätzlich zum Personal-Account
jedes Users. Ein User kann Mitglied in beliebig vielen Teams und einem
eigenen Personal-Account sein und zwischen ihnen im Account-Switcher
wechseln.

### Wer darf Teams erstellen

In der aktuellen Ausbaustufe ist das Anlegen eines Teams **manuell
freigeschaltet**. Admin setzt `users.can_create_teams = true` per SQL
(Beta-Rollout). Der „Team erstellen"-Button ist nur für freigeschaltete
User sichtbar. Automatische Self-Service-Erstellung + Billing kommt in
einem späteren Release.

### Rollen

Pro Team hat jedes Mitglied genau eine Rolle. Die Rolle wird auf
`owner_account_members.role` gespeichert.

| Rolle    | Darf …                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------ |
| `owner`  | Alles. Team löschen, Eigentümerschaft übertragen, Billing-Einstellungen, Mitglieder inkl. Admins managen |
| `admin`  | Mitglieder einladen/entfernen/Rolle ändern (außer Owner), Spaces verwalten, Team-weite Tokens anlegen  |
| `member` | Spaces + Inhalte erstellen/bearbeiten, Personal-Tokens anlegen                                         |
| `viewer` | Read-only Zugriff auf Spaces + Inhalte, keine Mutation                                                 |

Hierarchie: `owner ≥ admin ≥ member ≥ viewer`. Jede höhere Rolle darf alles,
was die niedrigeren dürfen.

**Legacy-Kompatibilität:** die Tabelle `space_members` nutzt weiter die
älteren Werte `editor` und `reader` — im Code werden diese als Alias
behandelt (`editor ≙ member`, `reader ≙ viewer`).

### Einladungs-Flow (aus User-Sicht)

1. Ein Owner oder Admin öffnet **Settings → Team → Mitglieder** und klickt
   „Mitglied einladen". Input: Email + Rolle.
2. lokri legt einen Invite an (mit 7 Tagen Gültigkeit) und schickt einen
   **Magic-Link** an die angegebene Email-Adresse.
3. Der Eingeladene klickt den Link (`/invites/accept?token=…`):
   - **Hat keinen Account:** minimales Sign-up-Formular (Name + Passwort).
     Die Email ist durch den Mail-Klick bereits verifiziert — keine zweite
     Verification-Mail.
   - **Hat schon einen Account:** Sign-in-Seite, danach Confirm-Screen
     („Du wirst Mitglied von X als Y").
4. Nach Bestätigung: Eintrag in `owner_account_members`, `active_owner_account_id`
   wird auf das neue Team gesetzt, Redirect ins Dashboard.

Invites sind **Email-gebunden**: wer sich mit einer anderen Adresse
einloggt als der, an die der Invite ging, bekommt `EMAIL_MISMATCH` und
muss den richtigen Account nutzen (oder einen neuen Invite anfordern).

### Was Teams mit Personal-Accounts teilen

Identisch:
- Schema der Entitäten (Spaces / Notes / Files / Tokens / Embedding-Key).
- Suche, MCP-Endpoint, PayPal-Flow (für One-Time Captures), Export.
- Quota-Modell (siehe unten „Besonderheiten").

### Besonderheiten Team vs. Personal

- **Plan**: Teams laufen auf dem `team`-Plan (seat-basiert, 9 €/Seat/Monat
  bzw. 90 €/Seat/Jahr). Storage-Limits werden je nach **aktiver Seat-Zahl
  multipliziert** — 3 Mitglieder → 3× `max_bytes` etc. Wird ein Mitglied
  entfernt und die Nutzung übersteigt das neue Limit, schaltet das Team
  effektiv auf **read-only** (kein Auto-Down­grade, Quota-Helper wirft
  `QUOTA:…` auf Schreiboperationen, bis entweder wieder Seats hinzu­kommen
  oder Daten gelöscht werden).
- **MCP-Tokens**: unterscheidet nach Scope:
  - **Personal-Token im Team-Account** — an den erstellenden User
    gebunden, wird automatisch revoked, wenn der User das Team verlässt.
  - **Team-Token** — dem Account zugeordnet, überlebt Mitglieder-Wechsel.
    Nur `owner`/`admin` dürfen Team-Tokens anlegen.
- **Spaces**: alle sichtbar für alle Mitglieder des Teams. Per-Space-ACL ist
  vorbereitet (`space_members` existiert), aber im MVP nicht UI-geführt.
- **Account-Switcher**: im Dashboard-Header. User wählt aus, in welchem
  Account er arbeitet. Die Wahl wird in `users.active_owner_account_id`
  persistiert, überdauert Session-Grenzen. Personal-Account ist Fallback
  wenn nichts gesetzt ist.
- **Audit-Log**: security-relevante Events (team.created, member.invited,
  member.role_changed, token.revoked_on_member_remove, login.success, …)
  werden in `audit_events` mitgeschrieben. **Kein UI in V1** — Abfrage per
  SQL (siehe `docs/OPS.md`).
- **Team löschen**: nur `owner`. Eingabefeld mit Team-Name als
  Bestätigung; danach Hard-Delete inklusive Storage-Objekt-Bereinigung
  (analog User-Delete-Flow).

### Was NICHT Teil dieser Ausbaustufe ist

Die folgenden Punkte sind bewusst offen gelassen und kommen später:

- **Automatisches Billing** für Teams — aktuell manuell. Ein
  Team-Account auf `team`-Plan ist für uns vorerst ein Trust-Based-Setup
  mit manuellem Rechnungsversand. PayPal-Subscriptions oder Stripe-
  Integration sind ein eigener Meilenstein.
- **Per-Space-ACL-UI** — Schema (`space_members`) existiert, aber im MVP
  sehen alle Team-Mitglieder alle Spaces des Teams.
- **Audit-Log-UI** — Daten werden erfasst, aber für V1 gibt es kein
  Frontend. SQL-Snippets in `docs/OPS.md` decken den Admin-Use-Case ab.
- **Ownership-Transfer** via UI — kann im MVP entfallen; wird nachgezogen,
  sobald Bedarf besteht.
- **SSO / SAML** — Solo- und kleine-Team-Fokus, Enterprise-Auth ist
  getrennter Epic.
- **Cross-Account-Moves** — einen Note oder File von Personal zu Team zu
  verschieben geht derzeit nicht; Re-Upload + Delete ist der Weg.
- **Team-Discovery** — es gibt keine „öffentlichen Teams", Teams sind
  ausschließlich invite-based.
