# User-Settings Design-Prinzipien

Verbindliche Regeln für den User-Scope: `/profile/*`, `/settings/*`, `/team/*`,
`/billing/*` (nach Umzug: `/settings/billing/*`), Dashboard-Home.

Der **Admin-Scope** (`/admin/*`) folgt eigenen Regeln — siehe
`docs/ADMIN_DESIGN.md`. Die beiden Scopes sind bewusst unterschiedlich
gestaltet (Content-Site vs. Operator-Tool, größere Typografie vs.
dichter Info-Layout). Bei Zweifelsfällen gilt: User-Scope hier, Admin-
Scope dort.

## Die fünf Prinzipien

### 1. Tabs nur für gleichwertige Sub-Zwecke

Tabs sind nur dann angemessen, wenn der User zwischen **Perspektiven auf
denselben Kontext** wechselt. Die Sub-Pages stehen inhaltlich nebeneinander,
nicht in einer Sequenz.

**Ja:** `/team` → Übersicht / Mitglieder / Sicherheit — der User will
zwischen Sichten auf dasselbe Team wechseln.

**Nein:** Ein „Upgrade"-Tab im Billing-Bereich, in dem ein Plan-Vergleich +
Checkout-Flow lebt. Das ist eine Sequenz, keine Perspektive → Dialog oder
Sub-Route.

### 2. Danger-Zone als Card unten auf der Hauptseite, nie als eigener Tab

Destructive Actions (Account löschen, Team löschen) gehören an den Fuß der
logisch passenden Hauptseite, nicht auf eigene Tabs versteckt. Die Card
hat eine klar sichtbare `border-destructive/40`-Abgrenzung und eine
Heading wie „Gefahrenzone".

**Ja:** Konto-Löschen-Card unten auf `/profile/data`.

**Nein:** Ein Tab `/profile/danger`, der nur diese eine Action enthält.

### 3. Card-in-Card vermeiden

Jede Card ist flach: Heading + Description + Content. Wenn mehrere Themen
in einer Card liegen, nest keine weitere Card hinein — split in mehrere
Cards.

**Ja:** `/profile` hat zwei Cards: „Öffentliches Profil" (Avatar + Name)
und „Sprache" (Locale-Switcher).

**Nein:** Eine Card „Übersicht", die intern zwei weitere Cards rendert.

### 4. Meta-Info in `<PageHeader>` oder Widget-Cards, nicht als Title-Doppelung

Account-Name, Plan, Rolle, Typ-Badge etc. gehören entweder in den
`<PageHeader>` (wenn sie die Seite identifizieren) oder in dedizierte
`<WidgetCard>`s (wenn sie Dashboard-Charakter haben). Sie werden nie als
Card gerendert, deren Title identisch mit dem PageHeader-Title ist — das
wäre eine Title-Doppelung ohne Mehrwert.

**Ja:** `/team` zeigt oben einen Widget-Grid (Team-Name, Plan, Rolle),
darunter eine Edit-Card „Team-Name bearbeiten".

**Nein:** `/team` zeigt eine Card „Team" mit CardTitle „Team" und Content
„Name: X, Plan: Y, Rolle: Z".

### 5. Conversion-Flows als Dialog oder Sub-Route, nicht als Tab

Upgrade-Flows, Create-Flows, Invite-Flows sind **Aktionen**, keine
Perspektiven. Sie gehören in Dialoge (shadcn `Dialog`) oder Sub-Routen,
getriggert durch Buttons.

**Ja:** „Neues Team erstellen" via `+`-Button im AccountSwitcher, öffnet
Dialog. „Plan wechseln"-Button auf `/settings/billing`, navigiert zu
`/settings/billing/plans`.

**Nein:** Ein „Plan-Wechsel"-Tab zwischen Übersicht und Rechnungen.

---

## Bereichs-Matrix

| Bereich | Struktur-Typ | Kommentar |
|---|---|---|
| `/dashboard` | Single-Page mit Hero-Header | Landing-Seite; kein PageHeader (Hero ist eigenes Pattern) |
| `/profile/*` | Tabs (Übersicht / Sicherheit / Daten) | Drei Perspektiven auf denselben User; Konto-Löschen als Danger-Card auf `/profile/data` |
| `/settings/*` | Tabs (Allgemein / MCP / Storage / Billing) | Allgemein ist Widget-Dashboard mit Embedding-Key-Section; Billing hat eine Sub-Route `/settings/billing/plans` für den Plan-Wechsel-Flow |
| `/team/*` | Tabs (Übersicht / Mitglieder / Sicherheit) | Hybrid: Übersicht = Widget-Dashboard + Danger-Zone; Mitglieder = Tabelle + Invites; Sicherheit = SSO-Shell (Phase 3) |

## Komponenten-Patterns

### `<PageHeader>` (`components/ui/page-header.tsx`)

Einheitliche Kopfzeile für jede Top-Level-Route im User-Scope:
`text-3xl sm:text-4xl` Typografie, optional Breadcrumbs oben, optional
Actions-Slot rechts. Genau ein `<h1>` pro Seite — strikt.

### `<Breadcrumbs>` (`components/ui/breadcrumbs.tsx`)

Primitive für Breadcrumb-Trails. Letzter Crumb unverlinkt auch bei
gesetztem `href` (WCAG 2.4.8 — current page nicht auf sich selbst
verlinken).

### `<WidgetCard>` (`components/ui/widget-card.tsx`)

Kompakte Info-Card für Landing-Dashboards (`/settings/general`,
`/team`). Struktur: **Label** (Uppercase-Kleinzeile) + **Value** (große
Zahl oder Text) + optional **Hint** (beschreibender Kleintext) +
optional **Action** (Link oder Button rechts unten).

Grid-freundlich (flexible Breite), gleichmäßige Höhe auf einer Seite
via `grid-auto-rows: 1fr` im umschließenden Grid.

### Card mit Heading + Description + Content

Standard für alle Content-Sections. Card-Header enthält `CardTitle`
(schwarz, fett) und `CardDescription` (muted). Content direkt darunter.

### Danger-Zone-Card

Standard für destructive Actions: `border-destructive/40`-Border, Card-
Heading wie „Gefahrenzone" oder „Team löschen", Action ist ein
`<Button variant="destructive">`. Confirm via Echo-Input (User tippt den
zu löschenden Namen ein).

### Scope-Hint

Einzeiler direkt unter den Tabs auf `/settings/*`-Pages:
„Diese Einstellung gilt für deinen persönlichen Account." /
„Diese Einstellung gilt für das Team X." `text-xs text-muted-foreground`,
keine Card, keine Box — bewusst zurückhaltend.

## Typografie-Kanon

- **H1 (PageHeader-Title):** `text-3xl sm:text-4xl font-semibold tracking-tight leading-tight`
- **PageHeader-Description:** `text-sm text-muted-foreground`
- **Breadcrumbs:** `text-xs text-muted-foreground`, letztes Item `font-medium text-foreground`
- **CardTitle:** shadcn-Default
- **Widget-Label:** `text-xs text-muted-foreground tracking-wide uppercase`
- **Widget-Value:** `text-2xl font-semibold`
- **Widget-Hint:** `text-sm text-muted-foreground`

## Abgrenzung zum Admin-Scope

Admin lebt in `app/(admin)/*` und nutzt eigene, kleinere Typografie
(`text-lg sm:text-xl` für H1) sowie den eigenen `<AdminPageHeader>`.
**Keine User-Scope-Komponente referenziert Admin-Komponenten und
umgekehrt.** Cross-Import-Versuche scheitern am PR-Review.
