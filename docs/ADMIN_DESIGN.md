# Admin-Design (Draft)

**Stand:** Draft nach Schritt-1-Audit, vor Freigabe.
**Scope:** `app/(admin)/*` — alle Pages, Layout, Sidebar, Charts.
**Basis:** `docs/DESIGN_SYSTEM.md` — gleiche Tokens, gleiche Fonts, gleiche Radius-Stufen. Dieses Dokument beschreibt, **was im Admin anders ist** und warum.

---

## Prinzipien

### 1. Admin ist ein Operator-Tool, kein Content-Site

Der User-Bereich optimiert für Ruhe und Fokus auf einzelne Inhalte. Der Admin-Bereich optimiert für **schnelle Orientierung und Info-Dichte** — der Operator scannt 100 User-Rows, bevor er eine anklickt. Layout-Entscheidungen folgen:

- **Dichte vor Luft.** Tabellen nutzen ihre volle Breite (keine `max-w-4xl`-Wrapper auf Listen). Paddings enger als im User-Scope (`py-1.5`/`py-2` auf Rows, nicht `py-4`).
- **Kleinere Schriftgrößen als Default.** `text-sm` für Body, `text-xs` für Secondary-Metadata, `text-[10px]`/`text-[11px]` für Badges und Sub-Labels. `text-base` kommt nur in primären CTAs und Card-Titeln vor.
- **Mono ist Information-Vehikel.** IDs, Timestamps, Hashes, Token-Prefixes, Plan-Keys, Byte-Werte, Prozent-Labels — alle in Geist Mono. Operatoren lesen Patterns in Mono-Text schneller als in Proportional-Schrift.
- **Farbige Status-Signale sind funktional, keine Dekoration.** Healthy (emerald), Warning (amber), Error (destructive), Info (sky), Neutral (muted). Diese werden kontrolliert über eine `<AdminStatusBadge>`-Komponente mit Varianten eingesetzt — keine freien Farbwürfe mehr pro Call-Site.

### 2. Keine Editorial-Ästhetik

Alles aus `docs/DESIGN_SYSTEM.md` → Anti-Patterns gilt 1:1 auch im Admin:

- Keine Serif, keine Italic-Akzente
- Keine Pastell-Gradient-Flächen
- Keine `font-display`-Klasse (wird am Ende dieser Session final entfernt)
- Keine literarischen Page-Headings

Admin-Page-H1s sind kleiner als User-Page-H1s (`text-lg sm:text-xl`, nicht `text-2xl sm:text-3xl lg:text-4xl`), weil im Admin die Navigation/Breadcrumbs oben einen Teil des Visual-Hierarchy-Gewichts tragen und der Content unten wichtiger ist als die Überschrift.

### 3. Admin-Identity ohne Amber-Tint

Aktuell signalisiert die Amber-Sidebar „du bist im Backoffice". Das Ziel der Redesign-Session ist, diesen Signal-Mechanismus **beizubehalten**, aber **neutraler** umzusetzen:

- Sidebar-Hintergrund: `bg-muted/30` (minimal vom Main-BG abgesetzt)
- Active-Item: `bg-muted text-foreground` (wie Mobile-Nav im User-Scope)
- Hover: `hover:bg-muted/60 hover:text-foreground`
- Admin-Badge oben im Layout-Header: neutral, mit `<ShieldCheck>`-Icon, ohne Amber
- **Backoffice-Signal 2.0:** subtile Accent-Linie am linken Sidebar-Rand in `--brand` (2 px Breite, `bg-brand/40`). Diese ist so dezent, dass sie bei Fokus auf Content unsichtbar wird, aber beim Peripheren-Blick „hier ist etwas anderes" signalisiert.

Keine forced-Dark-Mode-Default im Admin — die `next-themes`-Präferenz wird respektiert. Ein Theme-Switch beim Rein-/Rausspringen zwischen User- und Admin-Scope würde Flicker und Wahrnehmungs-Reibung erzeugen.

### 4. Drill-Down-UX, nicht Modal-UX

Admin-Listen sind klickbar (ganze Row oder expliziter „Öffnen"-Button). Details passieren auf eigenen Routes (`/admin/users/[id]`), nicht in Modals. Ausnahmen:

- Confirm-Dialoge für destruktive Aktionen (Delete, Revoke, Disable)
- Quick-Edit-Dialoge (Token-Create, Ownership-Transfer) — bleiben Dialogs, weil kurz
- Der bestehende 5-Step-Wizard für Team-Invoices ist eine Route, kein Modal — korrekt

---

## Typografie-Scale (Admin-Overrides)

Basis: `docs/DESIGN_SYSTEM.md` → Typografie-Scale. Admin weicht an diesen Stellen ab:

| Rolle | User-Scope | Admin-Scope |
| --- | --- | --- |
| Page-H1 | `text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight` | `text-lg sm:text-xl font-semibold tracking-tight` |
| Section-H2 | `text-lg font-semibold tracking-tight` | gleich |
| Body-default | `text-sm` | gleich |
| Table-Row | — | `text-xs` + `text-sm` für den Primary-Value in der Zelle |
| Badge / Status-Chip | — | `text-[10px]` (sehr-kompakt) |
| Eyebrow | `text-xs font-medium uppercase tracking-wide text-muted-foreground` | gleich |
| KPI Big Number | `text-3xl` | `text-2xl` (Admin-KPIs sind mehr Tiles, weniger Heroic) |

Page-H1 kann in bestimmten Admin-Sub-Kontexten (z.B. Detail-Views mit wichtigem Subject) auf `text-xl sm:text-2xl` erhöht werden, wenn der Subject-Name das einzige Orientierungs-Element ist.

---

## Farb-Anwendung

### Neutrale Basis (identisch zum User-Scope)

`--background`, `--foreground`, `--card`, `--muted`, `--border`, `--primary`, `--destructive` — siehe `docs/DESIGN_SYSTEM.md` → Farb-Palette.

### Status-Farben (Admin-spezifisch, explizit okay)

Admin darf Tailwind-Hardcoded-Farben für **funktionale Status-Signale** einsetzen, **aber nur über `<AdminStatusBadge>`**, nicht frei pro Call-Site:

| Variant | Light | Dark | Anwendung |
| --- | --- | --- | --- |
| `"success"` | `bg-emerald-500/10 text-emerald-700 border-emerald-500/30` | `text-emerald-400` | Healthy, Verified, Active |
| `"warning"` | `bg-amber-500/10 text-amber-700 border-amber-500/40` | `text-amber-300` | Stale, Attention-Needed, Inactive |
| `"danger"` | `bg-destructive/10 text-destructive border-destructive/30` | — (destructive handled via Token) | Error, Failed, Disabled, Revoked |
| `"info"` | `bg-sky-500/10 text-sky-700 border-sky-500/30` | `text-sky-300` | Login, Info, Neutral-Event |
| `"neutral"` | `bg-muted text-muted-foreground border` | — | Default, Unclassified |

Diese Varianten sind die **einzigen** Stellen, an denen Tailwind-Farb-Klassen direkt im Admin-Code stehen dürfen. Alles andere (Layout, Hover, Buttons) läuft über die neutralen Tokens. Der alte Amber-Layout-Stil wird komplett entfernt.

### Chart-Palette

Unverändert — die `--chart-1` bis `--chart-5`-Tokens bleiben bunt (Indigo/Fuchsia/Amber/Emerald/Cyan) und werden ausschließlich in BI-Charts benutzt. Die Chart-Wrapper-Komponenten in `app/(admin)/_charts/` sind aktuell okay und werden in diesem Redesign **nicht umstrukturiert**. Falls Chart-Labels oder Axis-Texts optisch aus dem neuen Admin-Stil fallen, wird das mitgezogen — aber die Datenfarben bleiben.

---

## Komponenten-Inventar

Alle neuen Komponenten landen in `components/admin/` (neu anzulegen). Drei Kategorien: **neu bauen**, **aus bestehenden User-Komponenten abzweigen**, **nicht extrahieren (inline lassen)**.

### Neu bauen

| Komponente | Datei | Zweck | Wiederverwendungen heute |
| --- | --- | --- | --- |
| `<AdminPageHeader>` | `components/admin/admin-page-header.tsx` | Breadcrumbs + H1 + Description + Action-Slot rechts | 12× Page-Header-Pattern, font-display-Elimination in einem Schritt |
| `<AdminStatusBadge>` | `components/admin/admin-status-badge.tsx` | Varianten-basierte Status-Chips (success/warning/danger/info/neutral), optional Icon | ~30 Inline-Badge-Call-Sites in Users/Accounts/Invoices/Tokens/Audit |
| `<AdminActionBadge>` | `components/admin/admin-action-badge.tsx` | Mono-Badge für Audit-Action-Strings (`admin.*` → warning, `login.*` → info, sonst neutral), nutzt `<AdminStatusBadge>` | Aktuell inline in `audit/_explorer.tsx` Zeile 359 |
| `<AdminTable>` + `<AdminTableEmpty>` + `<AdminTableLoading>` | `components/admin/admin-table.tsx` | Shell-Komponenten für die dichte Explorer-Tabelle — Wrapper-Div + `<table>` + Empty/Loading-Rows mit `colSpan` | 5× Explorer (Users/Accounts/Invoices/Tokens/Audit) |
| `<AdminKpiTile>` | `components/admin/admin-kpi-tile.tsx` | Klickbare KPI-Kachel mit Delta-Arrow (up/down/flat), drill-down-Link | Aktuell inline in `admin/_home.tsx`, 4× gerendert. Später erweitert-bar für Stats-Detail-Pages |
| `<AdminHealthTile>` | `components/admin/admin-health-tile.tsx` | Warn/OK-Tile mit optionalem Check-Predicate, nutzt `<AdminStatusBadge>` intern | Aktuell inline in `system/_client.tsx` als `StatusTile` |

### Aus User-Komponenten abzweigen oder teilen

| User-Komponente | Was damit passiert |
| --- | --- |
| `<Breadcrumbs>` (`app/(admin)/_breadcrumbs.tsx`) | Bleibt wo sie ist — Admin-only, aber gut. Wird von `<AdminPageHeader>` intern genutzt. |
| `<KpiCard>` (`components/kpi-card.tsx`) | **Nicht wiederverwenden**. Admin-KPI hat andere Semantik (Link + Delta statt Progress-Bar). User-KpiCard bleibt wie sie ist. |
| `<ActivityList>`/`<ActivityRow>` (`components/activity-list.tsx`) | User-Komponente, nicht im Admin-Scope. Wenn Admin-Home eine „Latest Activity"-Sektion bekommt, wird sie über `<AdminTable>` realisiert, nicht über ActivityList. |
| `<QuickActionCard>` (`components/quick-action-card.tsx`) | Nicht wiederverwenden — Admin-Shortcuts im Dashboard sind dichter. Stattdessen plain Link-Buttons. |
| `<ThemeToggle>` (`components/theme-toggle.tsx`) | Wird weiter benutzt im Admin-Sidebar-Footer. Unverändert. |
| `<Sheet>` (`components/ui/sheet.tsx`) | Für Mobile-Sidebar-Drawer, unverändert. |

### Nicht extrahieren (inline lassen)

| Pattern | Begründung |
| --- | --- |
| Filter-Bar (Search + Selects + Date-Inputs) | Zu variantenreich pro Explorer. Die Inputs sind bereits shadcn-shared; die Layout-Row bleibt inline. |
| Empty-State-TableCell / Loading-TableCell | Schon durch `<AdminTable>` abgedeckt, keine extra Komponente. |
| Confirm-Dialog-Pattern | Bestehendes `<Dialog>` aus shadcn reicht, bleibt inline pro Page. |

---

## Page-Header-Pattern

Jede Admin-Page folgt diesem Template (ersetzt die aktuelle `Breadcrumbs + h1.font-display + p.subtitle`-Kombi):

```tsx
<div className="space-y-6">
  <AdminPageHeader
    breadcrumbs={[{ label: "Dashboard", href: "/admin" }, { label: "User" }]}
    title="User-Verwaltung"
    description="Alle User im System. Suche, Filter, Inline-Toggles."
    actions={
      <Button size="sm" variant="outline">Aktualisieren</Button>
    }
  />
  {/* Page-Content */}
</div>
```

Rendert intern:

```
Breadcrumbs (existing component)
──────────
Title (text-lg sm:text-xl font-semibold tracking-tight)  ...  Actions →
Description (text-sm text-muted-foreground, mt-1)
```

Auf Mobile wrappt der Action-Slot unter die Description. Keine max-w-Constraints — Admin-Header läuft volle max-w-6xl-Breite.

---

## Table-Pattern

Jede Explorer-Page ersetzt ihre handgeschriebene Tabelle durch:

```tsx
<AdminTable columnsCount={8}>
  <AdminTableHead>
    <tr>
      <th>Email / Name</th>
      <th>Flags</th>
      ...
    </tr>
  </AdminTableHead>
  <AdminTableBody>
    {loading ? <AdminTableLoading /> : null}
    {data.users.length === 0 ? <AdminTableEmpty>Keine User gefunden.</AdminTableEmpty> : null}
    {data.users.map(u => (
      <tr key={u.id} className={u.disabledAt ? "opacity-50" : ""}>
        <td>{u.email}</td>
        ...
      </tr>
    ))}
  </AdminTableBody>
</AdminTable>
```

`<AdminTable>` kümmert sich um:
- Overflow-Scroll-Container (`overflow-x-auto rounded-lg border`)
- `<table>` mit `w-full text-sm`
- Thead mit `bg-muted/40`
- Tbody mit `divide-y`
- Standard-Zell-Paddings (`px-3 py-2`, `text-left` auf th)
- Hover-States auf Rows (`hover:bg-muted/30`)

Row-Klick-Targets bleiben Explorer-spezifisch (entweder `<Link>`-Wrapper auf einer Cell oder expliziter Öffnen-Button).

---

## Admin-Home (Dashboard-Draft)

Die bestehende Struktur (4 Klick-KPI-Tiles + 6 Charts) bleibt inhaltlich, wird aber visuell aufgeräumt:

```
Header (Breadcrumb = "Dashboard" als letztes Item, Subtitle, Refresh-Button rechts)

KPI-Tiles (4× AdminKpiTile, grid-cols-1 sm:grid-cols-2 lg:grid-cols-4)
  User gesamt  │  Team-Accounts  │  MRR  │  Storage belegt

Charts (6× ChartCard, grid-cols-1 lg:grid-cols-2)
  Signups │ MRR-Entwicklung
  Accounts/Plan │ Storage/Provider-Pie
  DAU/MAU │ Umsatz/Monat

(Letzte Audit-Events als Snippet — entfällt erstmal, kein Scope in Schritt 2)
```

---

## Sidebar-Redesign (Layout + Mobile-Drawer)

Aus:
```tsx
<aside className="... border-r border-amber-500/20 bg-amber-50/40 dark:bg-amber-950/10">
```

Wird:
```tsx
<aside className="... relative border-r bg-muted/30">
  <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-[2px] bg-brand/40" />
  {/* … */}
</aside>
```

Die 2-px-Accent-Linie am linken Rand ersetzt die Amber-Tint-Fläche als „du bist im Backoffice"-Signal. Dezent genug, um nicht zu stören; präsent genug, um beim Peripheren-Blick erkannt zu werden.

Nav-Items:
```tsx
active
  ? "bg-muted text-foreground font-medium"
  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
```

Kein Amber mehr an keiner Stelle der Sidebar — weder Active-State noch Hover noch Border noch Background.

Layout-Header (Admin-Modus-Badge oben):
```tsx
<span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-medium text-foreground">
  <ShieldCheck className="h-3 w-3 text-brand" />
  Admin-Modus
</span>
```

Neutrale Border, `--brand`-Tint nur im Icon. Der Admin-Disclaimer-Text rechts („Aktionen werden protokolliert.") bleibt `text-muted-foreground`.

---

## Migrations-Reihenfolge (Ausblick auf Schritt 2 + 3)

**Schritt 2 (nach Freigabe):**
1. `components/admin/*` anlegen: AdminPageHeader, AdminStatusBadge, AdminActionBadge, AdminTable + Subs, AdminKpiTile, AdminHealthTile
2. Admin-Layout + Sidebar refactor
3. Admin-Home umbauen
4. Screenshots in beiden Themes liefern für visuelles Feedback

**Schritt 3 (durchlaufend):**
1. Users-Page, Users-Detail
2. Accounts-Page, Accounts-Detail
3. Invoices-Page, Invoices-Detail
4. Tokens-Page
5. Audit-Viewer, Audit-Detail
6. System-Health
7. Stats-Sub-Pages (users/accounts/revenue/storage) — Charts bleiben visuell unangefasst, aber Page-Headers und KPI-Tiles oben drauf werden auf neue Komponenten umgestellt
8. Team-Invoice-Wizard (bleibt 5-Step, visuell aufräumen)
9. **`font-display` final entfernen** — alle 12 Admin-Call-Sites sind zu dem Zeitpunkt schon über `<AdminPageHeader>` gelaufen. Plus ein bekannter Call-Site in `app/(legal)/layout.tsx` (User-Scope, Prose-Wrapper) — der muss beim Class-Remove mitgezogen werden, sonst breakt das Legal-Layout.
10. Audit-Run + Typecheck + Lint + visuelle 4-State-Stichprobe
11. Commits + Push

---

## Offene Punkte zur Klärung (vor Freigabe Schritt 2)

1. **Brand-Accent-Linie an der Sidebar**: zustimmen oder verwerfen? Alternative: ganz neutrale Sidebar ohne Accent-Linie, nur über die Admin-Badge oben im Layout-Header signalisiert.
2. **`<AdminTable>` als Shell vs. volles Generic-DataTable**: ich plane nur die Shell (siehe oben). Wenn du später einen Column-Definition-DataTable willst (à la TanStack Table), ist das ein eigener Epic.
3. **Amber-Status-Farbe bei Warning**: bleibt als eine der Status-Varianten (funktional). Nur das Layout-Amber wird vollständig entfernt.
4. **Legal-Layout-Rider**: der `.font-display`-Call-Site in `app/(legal)/layout.tsx` wird beim Class-Remove mitgezogen (1 Call-Site, minimal invasiv). Okay?
