# lokri Roadmap

**Stand:** April 2026

**Positionierung (Arbeitstitel):** "Persistenter KI-Kontext" / "KI-Wissensspeicher mit MCP-Zugriff"

Nicht mehr: "MCP Gateway" — dieser Begriff ist mit 40+ Produkten am Markt ein Commodity. Lokris Unterscheidungsmerkmal ist die Kombination aus Gateway-Funktion und persistentem Content-Layer (Notes, Files, Spaces, semantische Suche).

---

## Aktive Arbeit

### Settings-Redesign (läuft)

Vier-Tab-Struktur: Allgemein (Widget-Dashboard + Embedding-Key + Danger) / MCP / Storage / Billing. Separater `/team/*`-Bereich als Hybrid (Übersichts-Widgets + Sub-Routes). Profile-Card-in-Card auflösen.

Status: Block 0 + 1 durch, Block 2 (Billing-Umzug) startet.

---

## Nächste Blöcke in Reihenfolge

### 1. SSO-Phase 3 — Team-Owner-Self-Service

Team-Owner konfigurieren SSO selbst unter `/team/security`. Admin-Consent-Flow mit Magic-Link. Email-First-Login auf `/login`. Error-UX lokalisiert. Info-Banner für neu-verfügbare SSO.

Startet nach Settings-Redesign-Abschluss.

Aufwand: ~7-8 Stunden, aufgeteilt auf 2-3 Sessions.

### 2. Connector-Framework (strategischer Top-Block)

Der Punkt, an dem lokri vom "nur eigene Daten"-Produkt zum echten Gateway mit Storage-Layer wird. Referenz-Architektur: Obot (gelernt, Gateway dünn + Connector-Schicht dick).

**Phase 1 Scope:**

- `ConnectorProvider`-Interface (Registry-Pattern wie Obots ConnectorDefinition)
- Scope-Whitelist pro Connector
- Permission-Middleware (Team/User-Scope-Checks)
- **Erste Connectors:** Confluence + ein zweites Tool (Auswahl offen — Kandidaten: Notion, Linear, Google Drive, Gmail)
- **Slug-Pattern:** `a-z + hyphens`, als Prefix für Tool-Namen (aus Gatana übernommen)
- **Visibility-Modell:** Private / Team / Space-spezifisch
- **Plan-Gating:** bestimmte Connectors als Pro-Only

**Nicht Teil von Phase 1:**

- Custom-MCP-Konfiguration durch User (kommt in späterer Phase als "Power-User"-Option)
- MCP-Registry-Search (Gatana-Style)

**Begründung der Reihenfolge:** Erst mit eigenem kurierten Connector-Set die Patterns lernen, dann Power-User-Option bauen mit den gelernten Best-Practices.

Aufwand: mehrwöchig, eigenes Projekt.

### 3. External Secret Stores (Enterprise-Readiness)

Inspiration Gatana. User verknüpft einen externen Vault (HashiCorp Vault, AWS Secrets Manager, Azure Key Vault, GCP Secret Manager). Lokri liest Secrets bei Bedarf, persistiert sie nicht.

**Wert:**
- Compliance-Argument für datensensitive Kunden
- Audit-Trail beim Kunden, nicht bei lokri
- Keine Key-Rotations-Logik in lokri nötig

**Phase 1:** HashiCorp Vault + AWS Secrets Manager
**Phase 2:** Azure Key Vault (für M365-Kunden)
**Phase 3:** GCP + weitere

Startet nach Connector-Framework Phase 1, weil ohne Connectors kaum Secrets zu verwalten sind.

### 4. Design-System Phase 2 — Layout-Overhaul

Aktuell: Horizontale Top-Nav mit 5 gleichwertigen Tabs. Wird bei wachsender Feature-Fülle eng.

Überlegung: Umstellung auf Sidebar-Navigation mit semantischen Sections (inspiriert von Gatana, Linear, Notion, Raycast). Referenz nur als Input, nicht als Kopie.

**Voraussetzung:** Vorher User-Journey-Map erstellen. "Was macht ein Knowledge Worker in lokri in seinen ersten 5 Minuten?"

**Nicht akut.** Aktuelles Layout funktioniert. Aber vor dem öffentlichen Launch geplant.

### 5. Custom-MCP-Konfiguration (Power-User)

Gatana-Style: User kann beliebige MCP-Server hinzufügen, manuell oder aus Registry.

**Bewusst niedrige Sichtbarkeit** (unter "Advanced"), mit Security-Hinweisen und klaren Warnungen vor nicht-vertrauenswürdigen Quellen.

Kommt nach Connector-Framework Phase 1 + 2, wenn lokri genug Erfahrung mit eigenen Connectors hat, um die Patterns auf Custom-MCPs zu übertragen.

### 6. Public Launch mit neuer Positionierung

Website-Refresh, Marketing-Copy neu schreiben mit "Persistenter KI-Kontext"-Framing. DSGVO-/EU-USP explizit machen (aber nicht mehr als einziger Differenzierer — Gatana besetzt das Feld auch).

**Vorbedingungen:**
- Connector-Framework Phase 1 fertig (sonst keine Integrations-Tiefe)
- Design-System Phase 2 durch (Layout nicht im alten Zustand launchen)
- Mindestens einen zahlenden Kunden für Case-Study

---

## Wettbewerbs-Kontext (April 2026)

### Direkte Wettbewerber

**Gatana** (gatana.ai, ex-MCP-Boss) — Schweiz-based, EU-Sovereignty-Framing, OIDC+SAML, SCIM, External Secret Stores, Hosted Tools. $4/User/Monat Pro-Tier. Positioniert für IT-Departments und Dev-Teams. Nicht direkte Konkurrenz in lokris Knowledge-Worker-Nische.

**Peta** — 1Password-for-Agents, self-hosted, Vault + Gateway + HITL-Approvals. Technischer User-Profile. Overlap begrenzt wegen HITL-Fokus.

**MintMCP, TrueFoundry, Webrix, Zuplo** — Enterprise-Gateways, Kubernetes-orientiert. Andere Zielgruppe.

### Indirekte Inputs

**Obot** — Open-Source-Platform, lokris Architektur-Referenz für Connector-Framework.
**Mem0 / Letta** — Memory-Layer-Produkte ohne Gateway. Wenn lokri sich als "Context+Memory+Gateway" positioniert, kommt der Vergleich zu Mem0 — lokri unterscheidet sich durch Gateway-Funktion und Team-Fähigkeit.

### Lokris Differenzierung

1. **Content-Layer integriert** (Notes, Files, Spaces, Suche) — Gateway-Konkurrenten haben das nicht
2. **Knowledge-Worker-Zielgruppe** statt IT-Dept — andere UX-Erwartung
3. **Deutsche Sprache nativ** — Gatana und andere sind englischsprachig
4. **Einfachere Onboarding** — kein Kubernetes, kein SCIM-Setup für den Einstieg

### Lokris Lücken gegen Gatana

- SAML (nur Entra OIDC in Phase 3)
- SCIM / Auto-Provisioning
- Custom-MCP-Server (Phase 5 oben)
- Hosted Tools (JS-Code als MCP-Tool deployen)
- Remote Secret Stores (Phase 3 oben)

Diese Lücken sind **keine Krise**, solange lokri in seiner Knowledge-Worker-Nische bleibt. Sie werden relevant, sobald Enterprise-Kunden anklopfen.

---

## Strategische Inputs (gesammelt, nicht priorisiert)

### Aus Gatana-Analyse:

- **Slug-Pattern für Connectors** (übernommen in Phase-2-Plan oben)
- **Secret-Store-Integration** (eigener Roadmap-Block)
- **Output Compression für Tools** — Token-Spar-Feature, Phase-2-Detail im Connector-Framework
- **Sidebar-Navigation mit Sections** (eigener Roadmap-Block)
- **Zwei-Stufen-Connector-Add-Flow** (Manual vs Registry) — übernehmen wenn Custom-MCP kommt

### Aus Obot-Analyse:

- **Gateway dünn halten** (Auth + Routing), Connector-Schicht dick (Authorization, Audit, Protokoll-Übersetzung)
- **ConnectorDefinition als Code-Registry**, einzelne Integrationen als DB-Daten
- **Scoped Tokens erweitern** um Connector-Integration-IDs (Composite-Scope)
- **Client-Token und Upstream-Token separat modellieren** (offen für RFC 8693 Token-Exchange)

---

## Nicht auf der Roadmap

- SCIM-Provisioning (zu früh, keine Enterprise-Kunden)
- Google Workspace SSO (Entra reicht für erste Kunden)
- Kubernetes-Deployments / On-Premise (aktuell Vercel + Neon reicht)
- Agent-to-Agent-Protokoll (Gatana macht das, lokri braucht's noch nicht)
- Runnable Code / JS-Hosted-Tools (Gatana macht das, zu breit für lokris Scope)

# Roadmap-Ergänzung: Hybrid-Deployment-Pattern

**Status:** Idee / Strategische Option
**Erfasst:** April 2026
**Anlass:** Gedanke aus Connector-Framework-Diskussion — Runner-Trennung zwischen Cloud und On-Prem

---

## Idee in einem Satz

Die Komponente von lokri, die mit externen APIs spricht (Connector-Runtime), könnte später als eigenständiger Runner extrahiert werden, den Kunden in ihrem eigenen Netzwerk deployen — während die Cloud-UI für Konfiguration, Team-Management, Billing und MCP-Endpoint zentral bleibt.

## Zielgruppe

Kunden, für die "EU-Hosting" nicht ausreicht, weil ihre Compliance-Anforderungen vollständige Daten-Souveränität verlangen:
- Banken, Versicherungen
- Öffentliche Hand, Behörden
- Healthcare (Kliniken, Pharma)
- Anwaltskanzleien, Steuerberater

Das ist eine **kleine, aber zahlungsstarke** Zielgruppe, die typischerweise Enterprise-Pricing rechtfertigt.

## Wie das Pattern aussähe

- **Cloud (lokri.io):** User-Accounts, Teams, Billing, Connector-Konfiguration, MCP-Endpoint, UI
- **On-Prem-Runner:** Führt Connector-API-Calls aus, hält Upstream-Credentials lokal, spricht mit internem Confluence/Slack/Jira
- **Protokoll zwischen beiden:** Runner pollt Cloud für Jobs (oder Cloud pusht via Websocket), Results kommen zurück. Credentials verlassen nie den Runner.

## Warum das architektonisch tragbar bleibt

Das aktuelle Connector-Framework-Design (in `CONNECTOR_FRAMEWORK.md`) hat die richtige Abstraktion:

- `ConnectorProvider.executeTool(name, args, context)` als klarer Vertrag
- Keine DB-Zugriffe aus Providern
- Keine Cross-Layer-Shortcuts

Das bedeutet: Ein zukünftiger `RemoteConnectorProvider`, der denselben Vertrag erfüllt aber HTTP gegen einen Runner spricht, ist **einfügbar**, ohne den Rest des Frameworks anzufassen.

## Was dafür heute wichtig ist

**Nicht bauen, aber schützen:**
- Provider-Vertrag nicht aufweichen (keine direkten DB-Zugriffe, keine Out-of-Band-Credentials-Behandlung)
- Filter-Pipeline bleibt in der Cloud (generisch), Provider-Interne in der Runner-Boundary
- Keine starke Kopplung zwischen Providern und Cloud-internen Services wie Auth oder Team-DB

**Nicht heute vorwegnehmen:**
- Kein `RemoteConnectorProvider`-Skeleton
- Kein Wire-Protokoll zwischen Cloud und Runner
- Kein Runner-Lifecycle (Update, Heartbeat, Health)

Diese Sachen würden heute falsch designt, weil echte Requirements fehlen.

## Trigger für die Umsetzung

Die Entscheidung, Hybrid-Deployment zu bauen, wird getroffen, wenn:

1. Mindestens **drei** Enterprise-Kunden explizit On-Prem als Blocker nennen
2. Der erste davon bereit ist, das als paid Pilot zu finanzieren
3. Lokri hat genug Stabilität (viele Millionen MCP-Calls, bewährtes Team), um ein Second-Tier-Produkt zu betreuen

Bevor diese Trigger erfüllt sind, ist Hybrid-Deployment eine Idee, kein Projekt.

## Was es explizit NICHT ist

- **Keine UI/Backend-Trennung der gesamten lokri-App.** Nur der Connector-Runtime-Teil wird separierbar.
- **Kein Kubernetes-Operator-Pattern.** Der Runner ist ein simpler Container (Docker oder Binary), den Kunden per docker-compose oder systemd betreiben.
- **Keine Offline-Fähigkeit.** Der Runner braucht Verbindung zur Cloud, sonst keine Jobs.
- **Kein Self-Hosted-lokri-Komplett.** Das wäre ein anderes Produkt mit anderem Support-Modell. Hybrid-Deployment ist Cloud-Produkt mit Runner-Extension.

## Referenzen aus dem Feld

Pattern im Einsatz bei:
- **GitLab** — gitlab.com + selbst-gehostete Runner für CI
- **HashiCorp Cloud** — Agents, die in Kunden-Infrastruktur laufen
- **Sentry Relay** — on-prem Proxy, der Events vorfiltert bevor sie zu Sentry Cloud gehen
- **Datadog Agent** — lokaler Collector, zentrale Cloud-Analyse

Alle haben Cloud-UI + On-Prem-Runtime-Komponente. Das Pattern ist bewährt.

## REST-to-MCP-Adapter (Phase 3+)

Generischer Connector-Typ, der beliebige REST-APIs als MCP-Tools exposed. 
Kein API-spezifischer Code, stattdessen Mapping-Config pro Integration.

**Ausgelöst wird das, wenn:**
- Mindestens 3 Confluence-Kunden lokri produktiv nutzen
- Klare Nachfrage nach REST-Integration aus mehreren Richtungen
- Pattern erkennbar: welche Teile sind wirklich gemeinsam, welche API-spezifisch

**Nicht gebaut werden im MVP:**
- OpenAPI-Spec-Parser mit Auto-Tool-Generierung
- Admin-UI für Mapping-Editor
- Authentication-Strategy-Matrix (Bearer, API-Key, OAuth, Cookie)
- Pagination-Abstraktion

**Technische Skizze (für später):**
- `RestApiProvider` als zweiter ConnectorProvider-Typ neben Providern wie 
  Confluence-Cloud
- Mapping-Definition als YAML oder JSON, gespeichert in 
  `connector_integrations.config`
- Tools werden aus Mapping-Config dynamisch generiert, nicht hart-codiert
- Search-Semantik: wenn API keinen Such-Endpunkt hat, lokri macht 
  Listing + Client-Side-Filtering

**Offene Fragen:**
- Wie wird Response-Shape auf lokri-interne Hits gemappt (titleField, snippetField)?
- Wie wird Scope-Enforcement generisch umgesetzt (Space-Keys → ???)
- Gibt es Bedarf für einen "API-Import"-Flow, der OpenAPI-Specs automatisch 
  einliest und Tools vorschlägt?

Referenz: IBM ContextForge hat das Feature implementiert, kann als 
Benchmark dienen wenn's soweit ist.