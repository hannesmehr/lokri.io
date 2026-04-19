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
