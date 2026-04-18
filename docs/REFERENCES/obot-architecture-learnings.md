# Architektur-Referenz: Obot-Learnings für lokris Connector-Framework

**Status:** Referenz-Dokument, keine Implementierungs-Vorschrift
**Erstellt:** April 2026
**Anlass:** Analyse von Obot (obot.ai) als Open-Source-Referenz vor dem geplanten Connector-Framework-Design

## Kontext

Obot ist eine Open-Source-MCP-Gateway-Plattform für Enterprise-Deployments. Der Stack ist fundamental anders als der von lokri (Go + Kubernetes + Docker-Hosting vs. Next.js + Vercel + Neon), und Obot adressiert ein anderes Marktsegment. Trotzdem hat Obot einige architektonische Entscheidungen getroffen, die unabhängig vom Stack tragen und sich als Leitplanken für lokris Connector-Framework eignen.

Diese Notiz sammelt die übertragbaren Entscheidungen. Die Obot-eigenen Features (MCP-Server-Hosting, Chat-UI, Agent-Framework, Kubernetes-Deployment) sind bewusst ausgeklammert — sie passen nicht zu lokris Profil.

## Obot in fünf Konzepten

Obot trennt sauber in fünf Konzepte, die jeweils eine eigene Verantwortung haben:

| Konzept | Verantwortung | Relevanz für lokri |
|---|---|---|
| MCP Hosting | Führt MCP-Server-Prozesse aus (npx, uvx, Docker-Container) | Nicht relevant — lokri hostet keine Server |
| MCP Registry | Katalog verfügbarer Server-Definitionen mit Metadaten | Relevant — Inspiration für Connector-Registry |
| MCP Gateway | Proxy zwischen Client und Server, Auth + Audit | Hoch relevant — Kerngeschäft von lokri |
| Obot Agent | Eigener KI-Agent mit Tool-Nutzung | Nicht relevant — lokri ist Substrat, nicht Agent |
| Obot Chat | Chat-UI analog ChatGPT | Nicht relevant — lokri ist kein Chat-Frontend |

Die für lokri relevanten Konzepte sind **MCP Registry** und **MCP Gateway**. Die folgenden Prinzipien stammen aus deren Design.

## Prinzip 1: Gateway dünn, Connector-Schicht dick

Obots Gateway macht bewusst wenig: Authentifizierung gegen Identity-Provider, sicherstellen dass der Zielserver läuft, Request weiterleiten. Die ganze Intelligenz — Authorization, Audit-Logging, Token-Exchange, Request-Filtering — liegt in einem Shim, der neben jedem MCP-Server läuft.

Obots Begründung: Der Gateway soll protokoll-transparent bleiben. Jede Erweiterung des Gateways erhöht die Komplexität für alle Server. Server-spezifische Logik gehört zum Server, nicht zum Gateway.

### Übertragen auf lokri

Das gleiche Prinzip funktioniert in Software, ohne dass wir separate Container brauchen. Die Trennung sieht so aus:

```
ConnectorGateway (dünn)
  └─ ConnectorProvider (per Connector-Typ)
       ├─ resolveScope(token, request)     — welche Ressourcen darf dieser Token sehen?
       ├─ authorize(request)                — ist dieser spezifische Call erlaubt?
       ├─ translate(mcp → upstream-api)     — MCP-Protokoll zu REST/GraphQL umwandeln
       ├─ audit(request, response)          — strukturiert loggen
       └─ handleUpstreamAuth()              — OAuth-Flow zum Zielsystem managen
```

Der Gateway selbst macht nur MCP-Protokoll-Handling, Token-Verifikation und Routing an den richtigen Connector.

### Warum das früh entscheiden?

Ohne diese Trennung landen Permission-Checks, Audit-Log-Schreibpunkte und OAuth-Handling im Gateway-Code. Nach drei bis vier Connectoren wird das zu einem Monolithen, der sich nicht mehr sauber erweitern lässt. Die Entscheidung, Gateway und Connector zu trennen, lässt sich später nur mit erheblichem Refactor nachziehen.

## Prinzip 2: Client-Token und Upstream-Token sauber trennen

Obot nutzt OAuth 2.0 Token Exchange (RFC 8693): Der Client schickt einen Token, den Obot nicht weiterreicht. Stattdessen tauscht der Shim diesen Token gegen einen Token für das Zielsystem — mit anderen Scopes, ausgestellt von einem anderen Authorization-Server.

Die standardkonforme Umsetzung ist aufwändig, aber das zugrundeliegende Konzept ist einfach und wichtig: **Client-Token und Upstream-Token leben in unterschiedlichen Berechtigungs-Räumen und müssen separat modelliert werden.**

### Übertragen auf lokri

Im MVP reicht eine pragmatische Umsetzung:

- Der lokri-Token (Client-seitig) authentifiziert gegen lokris eigene Permissions
- Pro `connector_integration` werden die Upstream-OAuth-Tokens verschlüsselt gespeichert
- Der Connector entschlüsselt den Upstream-Token bei Bedarf und macht den eigentlichen API-Call

Was wir unbedingt jetzt schon tun sollten: **Die Datenmodelle von Anfang an getrennt halten.** Nicht in derselben Tabelle, nicht mit denselben Feldnamen, keine versehentliche Überlappung. Das hält die Tür offen für eine spätere RFC-8693-konforme Implementierung, falls ein Use-Case sie rechtfertigt.

Ein einheitlicher "tokens"-Tabellen-Ansatz wäre der Sündenfall, der uns später teuer kommt.

## Prinzip 3: Registry als Datenmodell mit klaren Feldern

Obots `mcp-catalog` ist nicht frei formatiert, sondern folgt einem klaren Schema. Jeder Server-Eintrag hat:

- Name und Beschreibung (UI-Ebene)
- Runtime-Konfiguration (wie wird der Server betrieben)
- Environment-Variablen (welche Secrets braucht er)
- Tool-Preview (welche Tools bietet er an)
- Icon und Metadaten (für UI-Display)

Dazu kommt eine Kategorisierung über Server-Typen: Single-user, Multi-user, Remote, Composite.

### Übertragen auf lokri

Das Äquivalent für lokri ist keine Liste von MCP-Servern (die wir nicht hosten), sondern eine Liste von **Connector-Typen**. Vorschlag für die Struktur:

```typescript
type ConnectorDefinition = {
  id: string;                    // "confluence", "github", "slack"
  name: string;
  description: string;
  icon: string;
  category: 'knowledge' | 'code' | 'messaging' | 'files';
  authType: 'oauth2' | 'pat' | 'none';
  scopeModel: 'space-level' | 'repo-level' | 'channel-level' | 'folder-level';
  authConfig: {
    authorizationUrl?: string;
    tokenUrl?: string;
    scopes?: string[];
    // ...
  };
  tools: ToolPreview[];          // welche Tools liefert dieser Connector
  runtime: 'embedded' | 'external-http';
};
```

### Wichtige Unterscheidung: Definitionen vs. Integrationen

`ConnectorDefinition` beschreibt einen **Typ** von Connector (z.B. "Confluence-Connector allgemein"). Der lebt als Code im Repository und wird mit der Anwendung deployed.

`ConnectorIntegration` ist eine konkrete **Instanz** (z.B. "Hannes' Confluence-Cloud bei Empro"). Das lebt als DB-Row mit verschlüsselten Credentials, Scope-Whitelist, Sync-Status etc.

Diese Unterscheidung verhindert, dass man für jeden neuen Connector-Typ eine DB-Migration braucht.

## Prinzip 4: Composite-Scope als Erweiterung des bestehenden Scope-Systems

Obot kennt das Konzept "Composite Server" — ein virtueller Server, der mehrere physische Server zu einem kuratierten Tool-Set zusammenfasst. Genau das wollen Power-User: einen Token, der in einem Projekt-Scope mehrere Datenquellen gleichzeitig freigibt.

### Übertragen auf lokri

Der Scoped-Token-Mechanismus von lokri ist schon darauf vorbereitet. Heute: `api_tokens.space_scope uuid[]` (welche Spaces sind freigegeben) und `read_only boolean`.

Was später ergänzt werden sollte:

- Eine weitere Scope-Spalte `connector_scope uuid[]` (welche Connector-Integrationen sind freigegeben)
- Semantik: ein Token kann sowohl auf Spaces als auch auf Connector-Integrationen gescoped sein — oder auf beides

Damit wird der Scoped-Token zur einheitlichen Abstraktion für alle Zugriffsformen: "Dieser Token gewährt Zugriff auf Space-X, Space-Y und Confluence-Integration-Z, read-only".

## Was aus Obot bewusst NICHT übernommen wird

Zur Klarstellung, damit das spätere Framework-Design nicht verwässert:

- **Kubernetes/Docker-Hosting** — wir hosten keine MCP-Server selbst. Das ganze Lifecycle-Management entfällt.
- **RFC 8693 Token Exchange im MVP** — die Konzept-Trennung ja, die standardkonforme Implementierung später.
- **Webhook-Filter-System** — Obot erlaubt Custom-Filter per Webhook. Für KMU überdimensioniert.
- **Agent-Framework** — lokri bleibt Substrat, nicht KI-Agent.
- **GitOps-Workflow für Catalog** — Für lokri reicht eine Code-First-Registry im Repo. Kein separates GitOps-Setup.

## Roadmap-Einordnung

Diese Prinzipien sind **nicht jetzt umzusetzen**. Sie sind Leitplanken für den Moment, in dem das Connector-Framework konkret gebaut wird (nach Admin-Dashboard, i18n-Innenschicht und Entra ID SSO).

Die vier Prinzipien zusammengefasst als Entscheidungs-Checkliste beim Framework-Design:

- [ ] Gateway-Code und Connector-Code sind in getrennten Modulen
- [ ] Client-Token und Upstream-Token haben eigene Tabellen/Felder
- [ ] Connector-Typen sind als Code definiert, Integrationen als DB-Daten
- [ ] Scoped-Tokens unterstützen Composite-Scopes (Spaces + Connector-Integrationen)

## Quellen

- [Obot-Dokumentation: MCP Hosting](https://docs.obot.ai/concepts/mcp-hosting/)
- [Obot-Dokumentation: MCP Registry](https://docs.obot.ai/concepts/mcp-registry/)
- [Obot-Dokumentation: MCP Gateway](https://docs.obot.ai/concepts/mcp-gateway/)
- [Obot GitHub: mcp-catalog](https://github.com/obot-platform/mcp-catalog)
- [RFC 8693 — OAuth 2.0 Token Exchange](https://datatracker.ietf.org/doc/html/rfc8693)
