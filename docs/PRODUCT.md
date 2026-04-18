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
  werden in `audit_events` mitgeschrieben. Admins haben (seit Admin-
  Dashboard Teil 1) den Viewer unter `/admin/audit` (Teil 2) bzw. SQL-
  Snippets in `docs/OPS.md` als Fallback.
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
- **Audit-Log-UI** — kommt in Admin-Dashboard Teil 2. Teil 1 hat für
  Admin-Aktionen ein Per-Field-Audit mit `admin.*`-Prefix im Log
  hinterlegt; die Betrachtung läuft aktuell noch via SQL
  (`docs/OPS.md`).
- **Ownership-Transfer** via UI — kann im MVP entfallen; wird nachgezogen,
  sobald Bedarf besteht.
- **SSO / SAML** — Solo- und kleine-Team-Fokus, Enterprise-Auth ist
  getrennter Epic.
- **Cross-Account-Moves** — einen Note oder File von Personal zu Team zu
  verschieben geht derzeit nicht; Re-Upload + Delete ist der Weg.
- **Team-Discovery** — es gibt keine „öffentlichen Teams", Teams sind
  ausschließlich invite-based.

---

## Admin-Bereich

Seit Teil 1 hat lokri ein internes Backoffice unter `/admin`, gatet
hinter `users.is_admin = true`. Sichtbare Oberfläche (nicht der
öffentliche Produktumfang, aber für OPS-Runbooks relevant):

- **Dashboard** — KPI-Kacheln, in Teil 2 kommen Charts + Revenue-Graph.
- **User** — Liste, Detail, Flags setzen (`is_admin`,
  `can_create_teams`, `preferred_locale`), Disable/Enable, Sessions
  beenden, Passwort-Reset triggern, Hard-Delete.
- **Accounts** — Personal + Team zusammen. Plan-Wechsel, Ablaufdatum,
  **Quota-Override** (Bytes/Files/Notes pro Feld einzeln).
- **Rechnungen** — Suche + Filter, admin-PDF-Download, **manueller
  Team-Rechnungs-Wizard** (5 Schritte: Account → Parameter → Preview
  → Confirm → Ergebnis; erzeugt `orders` + `invoices` + optionale
  Mail; bumpt `plan_expires_at` mit Grace-Stacking).
- **Tokens** — globale Sicht auf `api_tokens`, Einzel-Revoke,
  **Bulk-Revoke-Inaktive** (Dry-Run + Apply, mit per-Account
  Audit-Event).

Jede mutierende Admin-Aktion schreibt ein `admin.*`-Audit-Event, das
auf den betroffenen Owner-Account gescopet ist — User sehen also in
ihrer eigenen Audit-Spur (später), dass ein Admin ihren Account
angefasst hat.

**Nicht im Admin-Bereich**: Content-Moderation (User-Files anschauen
oder löschen ist tabu), Feature-Flags pro User, Multi-Operator-
Rechtestufen (alle Admins haben volle Rechte). Retention-Policy für
Audit-Events ist offen.

Details in `docs/OPS.md`.

---

# Wettbewerbsanalyse & Marktpositionierung

*Stand: April 2026*

## Marktübersicht

Der MCP-Gateway-Markt ist deutlich aktiver als zu Projektbeginn angenommen. Aktuelle Community-Listen führen über 30 Produkte. Die Masse davon adressiert jedoch das Enterprise-Segment — Kubernetes-Deployments, SOC-2-Compliance, RBAC-Matrizen für 10.000+ User. Das Consumer- und KMU-Segment ist dagegen auffallend unterbesetzt.

Die MCP-Landschaft gliedert sich in drei Marktsegmente:

### 1. Enterprise MCP-Gateways

Stark besetzt, gut finanziert, mit klarem B2B-Enterprise-Fokus. Typische Vertreter:

- **MintMCP** — SOC 2 Type II, OAuth/SSO, STDIO-zu-Managed-Konvertierung, Cursor-Hooks-Partner
- **Composio** — 500+ vorgefertigte Integrationen, Managed Platform, „90% der Teams"-Positionierung
- **Obot** — Open-Source + Enterprise Edition, Kubernetes-nativ, kuratierter MCP-Katalog, Okta/Entra-Integration
- **MCP Manager** — starker Compliance-Fokus (GDPR, HIPAA), zentrale Policy-Enforcement
- **TrueFoundry** — AI Gateway mit MCP-Proxy-Teilfeature, umfassende RBAC
- **Bifrost** — Open Source in Go, kombiniert LLM-Gateway mit MCP-Governance, sub-Millisekunden-Overhead
- **IBM ContextForge** — Multi-Cluster Kubernetes, REST-zu-MCP-Bridging
- **Kong** — AI MCP Proxy Plugin ab Gateway 3.12, Enterprise-API-Gateway-Hintergrund
- **Cloudflare** — Zero-Trust-Integration für Workers-gehostete MCPs
- **Permit.io MCP Gateway** — Trust-Level-basierte Per-Tool-Permissions

**Gemeinsame Merkmale:** Infrastruktur-Overhead, DevOps-Kenntnisse vorausgesetzt, Preise ab $1.000/Monat aufwärts, Enterprise-Verkaufszyklen (3–12 Monate).

### 2. Self-Hosted Power-User Tools

Technisch solide, aber ohne UX-Ambition. Zielgruppe sind Entwickler, die selbst betreiben wollen:

- **MCPJungle** — Docker-basiert, Tool-Groups für Scoped-Endpoints. Vom Feature-Set das naheste Vergleichsprodukt, aber rein CLI/Config-getrieben, keine UI
- **Docker MCP Gateway** — Docker-CLI-Plugin, natürlicher Fit für Docker-Teams
- **AIRIS MCP Gateway** — Docker-basiert, Context-Token-Reduktion via Progressive Disclosure
- **Octelium** — Kubernetes-basiert, OPA/CEL Policy-as-Code
- **hyper-mcp** — Rust, WebAssembly-Plugins

**Gemeinsame Merkmale:** Docker oder Kubernetes erforderlich, keine End-User-UI, Dokumentation auf Entwickler-Niveau, keine SaaS-Option.

### 3. Consumer / Prosumer (lokri-Segment)

Dieses Segment ist weitgehend frei. Es gibt einzelne Ansätze, aber keine Lösung, die das vollständige Profil abdeckt:

- **Peta** — „1Password for AI Agents", self-hosted Vault + Gateway mit HITL-Approvals. Dev-fokussiert, kein Consumer-Produkt
- **Rube** — verbindet AI-Tools zu 500+ Apps. Fokus auf Breite, nicht auf Access-Control
- **Smithery** — „Agent's Gateway to the World". Eher Discovery-Plattform als Access-Control-Layer

Keiner dieser Player kombiniert die Dimensionen, die lokri besetzt: **EU-hosted, DSGVO-first, KMU-Pricing, Consumer-UI, Bring-Your-Own-Storage, Files-First, Scoped Tokens.**

---

## Differenzierung von lokri

### Was lokri einzigartig macht

Aus der Markt-Analyse ergibt sich eine konkrete, verteidigbare Positionierung:

> *Der DSGVO-konforme MCP-Gateway für KMU und Power-User, die keinen Kubernetes-Cluster haben.*

Die vier Säulen:

1. **EU-Hosting als Kernfeature, nicht als Compliance-Theater.** Vercel EU-Region + Neon EU + transparente Subprocessor-Liste. Die großen Player werben mit „GDPR-compliant", hosten aber faktisch auf AWS-US-Regionen.

2. **Consumer-UI auf Vercel/Notion-Niveau.** Self-Hosted-Alternativen wie MCPJungle haben technisch vergleichbare Features, aber keine Oberfläche für Nicht-Entwickler. Enterprise-Lösungen haben Admin-Dashboards für DevOps, keine für Endanwender.

3. **Bring Your Own Storage.** Kein Player im Segment bietet an, dass Nutzer ihren eigenen S3/R2/Hetzner-Bucket anbinden. Alle hosten eigenen Storage und nehmen entsprechende Margen. Für Power-User und KMU mit bestehender Infrastruktur ist BYOS ein echtes Differenzierungsmerkmal.

4. **Scoped MCP-Tokens als Standard-Feature.** Statt komplexer RBAC-Matrizen bietet lokri einfache Per-Space-Scopes und Read-Only-Flags, direkt im Dashboard konfigurierbar — ohne Policy-Engine oder JWT-Wristbands.

### Echte Konkurrenz für lokri

Die Analyse relativiert den Wettbewerbsdruck. Die Spieler, die tatsächlich um denselben Nutzer konkurrieren, sind überschaubar:

- **Mem0 / OpenMemory** — adressiert Memory-Use-Case, nicht Gateway-Use-Case. Überlappung gering
- **Onoma** — ist ein Chat-Frontend mit eigener Memory, kein MCP-Layer. Anderer Kategorie-Slot
- **MCPJungle** — featuremäßig am nächsten, aber ohne UI und Consumer-Ambition
- **Peta** — konzeptionell ähnlich, aber dev-fokussiert, keine Teams/DSGVO-Story

Keine dieser Lösungen kombiniert die vier Säulen. Die direkte Consumer/KMU-Konkurrenz für lokri ist faktisch offen.

---

## Marktsignale, die die Positionierung stützen

Die Recherche hat drei Trends bestätigt, die für lokri langfristig günstig sind:

### Marktwachstum trifft auf Infrastruktur-Lücke

Laut a16z zahlen bereits „29% der Fortune 500 und ~19% der Global 2000" für AI-Agents. Die großen Enterprise-Gateways bedienen diese Nachfrage. Darunter existiert ein substanzieller KMU-Mittelbau, den niemand sauber adressiert — genau das Segment, das lokri anspricht.

### Regulatorischer Rückenwind

Die spanische Datenschutzbehörde (AEPD) hat im Februar 2026 explizite Guidance zu AI-Agent-Data-Retention veröffentlicht. Die niederländische DPA folgte mit ähnlicher Warnung. Die EU AI Act ist seit 2. August 2025 mit Penalty-Provisions in Kraft (bis zu 7% globaler Jahresumsatz bei schwersten Verstößen). Bis dato haben Datenschutzbehörden €5,88 Milliarden an GDPR-Strafen verhängt — der regulatorische Druck wächst und differenziert EU-Anbieter zunehmend.

### Technische Spezifikations-Schwäche, die Gateways löst

Der offizielle MCP-Standard bietet von Haus aus keine **Tool-Filterung nach User-Identität**. Wenn User-A via OAuth Zugang zu einem MCP-Server hat, sehen seine KI-Clients alle Tools dieses Servers. Red Hat/Kuadrant dokumentiert das Problem ausführlich. Enterprise-Lösungen lösen es über Envoy-Middleware, JWT-Wristbands und cryptographisch signierte Header — alles Infrastruktur, die KMU nicht stemmen. Für lokri ist die Fähigkeit, dies über einfache Scoped-Tokens im UI zu lösen, ein echtes Verkaufsargument.

---

## Strategische Risiken und Gegenmaßnahmen

### Risiko 1: „Enterprise-Verführung"

Sobald lokri Gateway-Features auf KMU-Niveau anbietet, werden Enterprise-Interessenten anklopfen. Die Versuchung wird groß sein, „nach oben" zu pivotieren — in einen Markt, in dem Composio, MintMCP und Obot dominieren.

**Gegenmaßnahme:** Produkt-Roadmap und Marketing-Sprache klar auf KMU + Power-User zentriert halten. Enterprise-Anfragen sind valides Feedback, aber kein Anlass zur Repositionierung. „Für Teams ohne Kubernetes-Cluster" als Guardrail im Messaging.

### Risiko 2: „Zero-Data-Retention-Trend"

Enterprise-Käufer verlangen zunehmend, dass keine Kundendaten im Gateway-System persistiert werden. Artikel wie „Zero Data Retention MCP Servers" (Truto, April 2026) deuten auf eine Architektur-Verschiebung: stateless Pass-Through-Proxies statt Cache-Layer. Das aktuelle lokri-Modell (Files + Embeddings in Neon persistent) ist das Gegenteil.

**Gegenmaßnahme:** Beim Design des Connector-Frameworks (geplant nach Teams + i18n) Zero-Retention als Option architektonisch vorbereiten. Hybrid-Modus (Metadaten + Embeddings cachen, Volltexte on-demand) als sinnvoller Kompromiss für KMU. Enterprise-Ready ist Roadmap-Ziel, nicht MVP-Anforderung.

### Risiko 3: „Enterprise-Player entdecken KMU"

Es ist möglich, dass einer der großen Enterprise-Gateways ein abgespecktes KMU-Angebot launcht (analog zu Notion/Linear, die Enterprise nachgereicht haben). Der umgekehrte Weg ist seltener, aber nicht auszuschließen.

**Gegenmaßnahme:** Geschwindigkeit bei EU-spezifischen Features (Datenexport, AVV-Generation, EU-Region-Pinning, Subprocessor-Transparenz). DSGVO-Substanz lässt sich schwer kopieren, wenn die eigene Infrastruktur US-basiert ist.

---

## Handlungsempfehlungen für die Roadmap

Aus der Analyse ergeben sich drei konkrete Roadmap-Implikationen:

### 1. Connector-Framework priorisieren

Die wichtigste langfristige Differenzierung gegenüber Memory-only-Lösungen (Mem0, OpenMemory) ist die Fähigkeit, lokri als **Access-Gateway** zu etablieren. Ein sauberes Connector-Framework (ConnectorProvider-Interface, Scope-Whitelist, einheitliche Resource-URIs, Permission-Middleware, Audit-Logging) ist Voraussetzung für alle späteren Integrations-Erweiterungen.

Reihenfolge: **Teams → i18n → Connector-Framework → Erste zwei Connectoren (Confluence, ein zweites Tool mit anderem Permission-Modell).**

### 2. Zero-Data-Retention als Architektur-Option einplanen

Im Connector-Framework-Design von Anfang an berücksichtigen: Manche Connectoren sollten lokri **nicht** als Cache betreiben, sondern als Pass-Through-Proxy mit Filterung. Das öffnet mittelfristig Türen zu anspruchsvolleren KMU-Kunden, ohne die Consumer-UX zu belasten.

### 3. EU-spezifische Killerfeatures ausbauen

Bestehende Roadmap-Punkte im „Parking Lot" (Datenexport/Takeout-ZIP, AVV-PDF-Generierung, Retention Policies, Subprocessor-Liste mit Changelog-Notifications) sollten priorisiert werden, sobald die Team-Features laufen. Diese Features sind für US-basierte Wettbewerber praktisch nicht nachbaubar, ohne ihre Infrastruktur umzustellen — und sie sind genau die Features, die deutsche KMU-Einkäufer in die Leistungsbeschreibung schreiben.

---

## Zusammenfassung in einem Satz

Der MCP-Gateway-Markt ist im Enterprise-Segment gesättigt, im Consumer/KMU-Segment praktisch offen — und die regulatorische EU-Entwicklung macht DSGVO-first-Positionierung in den nächsten 24 Monaten zu einem zunehmend verteidigbaren Marktfeature.
