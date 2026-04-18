# Design System — lokri.io (Phase 1)

**Stand:** Phase 1 Redesign — Tokens + Showcase landed.
**Scope:** User-Bereich (Auth, Dashboard, Marketing). Admin-Bereich nutzt dieselben Tokens, wurde aber in Phase 1 nicht visuell überarbeitet.

---

## Prinzipien

1. **Vercel/Linear-inspiriert, nüchtern, technisch.**
   Wir bauen eine Developer-Tools-Oberfläche, keine Content-Site. Entscheidungen fallen immer zugunsten von Klarheit + Dichte vor Ornament.

2. **Dark-Mode ist gleichberechtigt, nicht nachträglich.**
   Jede neue Komponente muss in Light und Dark geprüft werden. Keine hardcoded Farben — alles läuft über CSS-Vars / Tailwind-Tokens.

3. **Kontrast über Borders, nicht über Schatten.**
   Shadows werden sparsam eingesetzt (max. `shadow-sm` bei Hover). Cards grenzen sich über `border` und minimalen Background-Kontrast vom Surrounding ab.

4. **Lila ist Akzent, nicht Fläche.**
   `--brand` ist für Primary-Actions, Links im Content, Focus-States und Highlights reserviert — nicht für Hintergrundflächen oder Icon-Tints. Keine Pastell-Gradient-Hintergründe mehr.

5. **Typografie durch Gewicht und Größe, nicht durch Schriftart.**
   Eine Schriftfamilie (Geist Sans) + Mono für Codes. Unterschiede zwischen H1/H2/Body entstehen über Size + Weight + Tracking, nicht über serifige Kontraste.

6. **Literarische Microcopy raus.**
   "Willkommen, *Hannes*." wird "Dashboard". "Dein persönlicher MCP-Wissens-Pool — erreichbar aus allen KI-Clients, die du …" wird "MCP-Gateway für deine KI-Clients". Kurz, funktional, technisch.

---

## Fonts

Geladen via `next/font/google` in `app/layout.tsx`:

| Rolle | Font | CSS-Var |
| --- | --- | --- |
| Body + Headings | **Geist Sans** | `--font-sans` |
| Code / IDs / Tokens / File-Sizes | **Geist Mono** | `--font-geist-mono` (exposed als `--font-mono`) |

**Aktiviert:** OpenType-Features `cv11` (unambiguous `i`), `ss01` (open digits — saubere `0 6 9`), `ss03` (alternate `g`/`a`). Setzt sich global via `html { font-feature-settings }` in `globals.css`.

Tailwind-Nutzung:
- `font-sans` — Default, muss meistens nicht explizit gesetzt werden
- `font-mono` — für alles, was aussieht wie Code: Token-Prefixes, UUIDs, File-Sizes, CLI-Snippets

### Legacy: `.font-display`

Diese Klasse wurde in Phase 0 auf `Instrument Serif` gelegt. In Phase 1 ist sie **intern auf Sans umgebogen** (siehe `globals.css`): Geist Sans + `font-weight: 600` + `letter-spacing: -0.02em`. Damit sehen alle 37 Call-Sites sofort modern aus, ohne dass wir jede Datei anfassen. Der Phase-2-Rollout räumt die Klasse dann weg und ersetzt sie durch explizite Tailwind-Klassen (`font-semibold text-tighter`).

**Neuen Code:** Nicht mehr auf `.font-display` verlassen — stattdessen `font-semibold tracking-tight` nutzen.

---

## Typografie-Scale

Keine custom Tailwind-Config — wir nutzen die Default-Scale. Konvention für die wichtigsten Kontexte:

| Rolle | Tailwind-Klasse | Size / Line-Height | Weight | Tracking |
| --- | --- | --- | --- | --- |
| Page-H1 | `text-2xl font-semibold tracking-tight` | 24px / 1.25 | 600 | tight |
| Section-H2 | `text-lg font-semibold tracking-tight` | 18px / 1.4 | 600 | tight |
| Card-Title | `text-base font-semibold` | 16px / 1.5 | 600 | normal |
| Body-default | `text-sm` | 14px / 1.5 | 400 | normal |
| Body-small | `text-xs text-muted-foreground` | 12px / 1.5 | 400 | normal |
| Eyebrow / Label | `text-xs font-medium uppercase tracking-wide text-muted-foreground` | 12px / 1.5 | 500 | wide |
| Big Number (KPI) | `text-3xl font-semibold tabular-nums` | 30px / 1.1 | 600 | normal |
| Mono / Code | `font-mono text-xs` oder `font-mono text-sm` | 12–14px | 400 | normal |

Alle User-Bereich-Headings sitzen jetzt auf `text-2xl`/`text-lg`, nicht mehr auf den früheren `text-4xl`/`text-5xl`. Tech-Tools bauen keine Magazin-Hero-Headlines.

---

## Farb-Palette

Shadcn "neutral" als Basis — reines Grau ohne Blau-/Grünstich. Brand separat auf `--brand`. Chart-Palette bleibt bunt (Admin-only, nicht Teil dieses Redesigns).

### Light Mode

| Token | oklch | Zweck |
| --- | --- | --- |
| `--background` | `oklch(0.99 0 0)` | Page-Hintergrund (minimal wärmer als `#FFF`) |
| `--foreground` | `oklch(0.145 0 0)` | Default-Text |
| `--card` | `oklch(1 0 0)` | Card-Flächen (weißer als BG, leicht erhöht) |
| `--muted` | `oklch(0.97 0 0)` | Hover-States, Subtile Flächen |
| `--muted-foreground` | `oklch(0.51 0 0)` | Secondary-Text, Icon-Tints |
| `--border` | `oklch(0.922 0 0)` | Trennlinien, Card-Rahmen |
| `--primary` | `oklch(0.205 0 0)` | Default-Button-Fläche (fast-schwarz) |
| `--primary-foreground` | `oklch(0.985 0 0)` | Text auf Primary |
| `--brand` | `oklch(0.55 0.17 295)` | Lila-Akzent für CTAs, Links, Focus |
| `--brand-foreground` | `oklch(0.985 0 0)` | Text auf Brand |
| `--destructive` | `oklch(0.577 0.245 27.325)` | Delete-Actions, Error-States |

### Dark Mode

| Token | oklch | Zweck |
| --- | --- | --- |
| `--background` | `oklch(0.145 0 0)` | zinc-950-artig, nicht pures Schwarz |
| `--foreground` | `oklch(0.985 0 0)` | Helles Text-Weiß |
| `--card` | `oklch(0.205 0 0)` | Leicht heller als BG — hebt Cards ohne Shadow ab |
| `--muted` | `oklch(0.269 0 0)` | Hover / subtile Flächen |
| `--muted-foreground` | `oklch(0.72 0 0)` | Secondary-Text |
| `--border` | `oklch(1 0 0 / 12%)` | Minimal kontrastreicher als Light, weiterhin dezent |
| `--primary` | `oklch(0.922 0 0)` | Near-white für Primary-Button |
| `--primary-foreground` | `oklch(0.205 0 0)` | Dunkler Text auf Primary |
| `--brand` | `oklch(0.68 0.17 295)` | Lila, aufgehellt für Dark-Kontrast |
| `--brand-foreground` | `oklch(0.145 0 0)` | Dunkler Text auf Brand |
| `--destructive` | `oklch(0.704 0.191 22.216)` | Heller-rot für Dark |

Brand hat gegenüber Phase 0 eine **Chroma-Reduktion von 0.22 → 0.17** — damit ist der Ton deutlich nüchterner (kein Neon-Violett mehr), aber noch klar als Lila erkennbar.

### Verwendung

| Intention | Tailwind-Klasse |
| --- | --- |
| Primary-Button (Standard) | `bg-primary text-primary-foreground` |
| Brand-Button (CTA mit Lila) | `bg-brand text-brand-foreground hover:bg-brand/90` |
| Link im Fließtext | `text-brand hover:text-brand/80 underline-offset-4 hover:underline` |
| Secondary/Ghost-Button | `hover:bg-muted` |
| Badge | `bg-muted text-foreground` oder `bg-brand/10 text-brand` für Akzent |
| Destructive | `bg-destructive text-white` |
| Subtile Card | `bg-card border` |

### Anti-Patterns

- ❌ **Pastell-Gradient-Flächen** — `bg-gradient-to-br from-indigo-500/8 via-background to-fuchsia-500/10` ist out.
- ❌ **Bunte Icon-Kreise mit Gradient-Background** — `bg-gradient-to-br from-indigo-500/15 to-fuchsia-500/15` für Feature-Icons ist out.
- ❌ **Hardcoded Tailwind-Farb-Klassen** in neuem Code — `text-indigo-700`, `bg-amber-50`, `border-emerald-500/20`. Läuft immer über CSS-Vars / semantische Tokens.
- ❌ **Literarische Serif-Headings** — `font-display italic text-brand` für „Willkommen, *Hannes*.".
- ❌ **Shadow-Lift-Hovers** — `hover:shadow-md hover:-translate-y-0.5` auf Cards. Stattdessen: `hover:border-foreground/20`.

---

## Border-Radius

| Token | Wert | Verwendung |
| --- | --- | --- |
| `--radius` | `0.5rem` (8px) | Basis |
| `--radius-sm` | `0.25rem` (4px) | Badges, kleine Pills, inline Chips |
| `--radius-md` | `0.375rem` (6px) | Inputs, kleine Buttons |
| `--radius-lg` | `0.5rem` (8px) | Cards, Dialogs, Popovers, Standard-Buttons |
| `--radius-xl` | `0.75rem` (12px) | Nur wenn wirklich prominente Flächen (Hero-Boxen o.ä.) — sparsam |

Gegenüber Phase 0 **deutlich reduziert** (war `0.75rem` Basis mit Multipliern bis `1.95rem`). Tech-Look mag mittlere Radien — nicht scharf, nicht rund.

---

## Shadows

**Nahezu keine.** Vercel/Linear nutzen Shadows fast nie — Cards grenzen sich über Border + Background-Stufung ab.

| Wann | Wie |
| --- | --- |
| Dropdown / Popover | `shadow-sm` (Standard von shadcn) |
| Toasts | `shadow-sm` |
| Card (ruhend) | **keine Shadow** — nur `border` |
| Card (hover) | **keine Shadow-Lift** — stattdessen `hover:border-foreground/20` |
| Modal / Dialog | `shadow-sm` ist okay; stärker nur, wenn explizit Fokus-Abgrenzung nötig ist |

Im Dark Mode sind Shadows ohnehin unsichtbar — Border-Kontrast übernimmt.

---

## Spacing

Tailwind-Default-Scale, keine Custom-Tokens. Konventionen für konsistente Abstände:

| Kontext | Klasse |
| --- | --- |
| Page-Container (vertical rhythm) | `space-y-6` |
| Section-Block intern | `space-y-4` |
| Card-Padding | `p-4` oder `p-6` (Cards mit viel Inhalt) |
| Grid-Gaps (Cards-Grid) | `gap-3` (dicht) oder `gap-4` (Standard) |
| Inline-Gaps (Button-Reihen) | `gap-2` |
| List-Item-Padding | `px-2 py-1.5` oder `px-3 py-2` |
| Page-Header → Content | `space-y-6` zwischen Breadcrumb, H1, Content |

---

## Responsive Design

### Grundprinzip

**Mobile-First.** Jede Komponente wird erst für die schmalste Variante
gebaut; Tablet und Desktop kommen als Breakpoint-Utility-Enhancements
oben drauf. Klassen ohne Prefix gelten für Mobile; alles mit `sm:`,
`md:`, `lg:` ist additiv.

### Breakpoints

Tailwind-Defaults — keine Custom-Schwellen.

| Tier | Prefix | Greift ab | Typischer Use-Case |
| --- | --- | --- | --- |
| Mobile | *(kein Prefix)* | 0 – 639 px | Phones Portrait/Landscape |
| Tablet | `sm:` | 640 px | Phones Landscape, Tablet Portrait-Klein |
| Small Desktop | `md:` | 768 px | Tablet Portrait/Landscape, schmale Desktops |
| Desktop | `lg:` | 1024 px | Standard-Desktop-Monitore |
| Large Desktop | `xl:` | 1280 px | Größere Monitore — selten nötig in Tools-UIs |

In der Dashboard-Home-Showcase nutzen wir alle vier unteren Tiers
aktiv; `xl:` ist bisher nicht gebraucht.

### Content-Max-Width

User-Bereich: `max-w-5xl` (64 rem = 1024 px) auf Header-Innencontainer
und Main-Container. Admin-Bereich bleibt auf `max-w-6xl` (72 rem =
1152 px), weil Admin-Seiten data-dense sind.

Begründung: bei `max-w-6xl` und 3-Spalten-Grids wurden die einzelnen
Cards im User-Bereich 350+ px breit — für kurzen Content (Label +
3-stelligen Value + kurze Description) ist das zu luftig. `5xl`
bringt Cards auf ~312 px — dichter, näher an Linear/Vercel.

**List-Sections sitzen noch enger:** Activity-Sektion (Letzte Notes,
Letzte Files) bekommt innerhalb des 5xl-Main-Containers nochmal ein
eigenes `mx-auto max-w-4xl` (896 px), damit sie sich von den breiteren
Summary-Widgets (Quick-Actions, KPI-Tiles in voller 5xl-Breite) optisch
abgrenzt und schmale Rows (z.B. „Geöffnete Browser-Tabs · gestern")
nicht in eine 470-px-Card fluten. Convention:

- **Summary-Widgets** (Zahlen, Badges, Quick-Actions): volle Main-Breite
- **List-Sections** (Notes, Files, Tokens, Invites): `mx-auto max-w-4xl`
  zentriert unter dem Summary-Block

### Grid-Layouts

Konventionen aus der Showcase:

| Kontext | Mobile | sm (640+) | md (768+) | lg (1024+) |
| --- | --- | --- | --- | --- |
| Quick-Actions (3 Cards) | 1 col | 2 cols | 2 cols | 3 cols |
| KPI-Tiles (mit Progress-Bar + Suffix) | 1 col | 1 col | 3 cols | 3 cols |
| Activity-Cards (zentrierte List-Section, 2 Stück) | 1 col | 1 col | 1 col | 2 cols (im `max-w-4xl`-Wrapper) |
| Onboarding-Steps (3 Stück) | 1 col | 1 col | 3 cols | 3 cols |

Faustregel: **„Breiter Content bleibt länger 1-spaltig."** Karten mit
mehr als einem Info-Element (z.B. Label + Value + Suffix + Progress-Bar
wie bei den KPI-Tiles) brechen erst bei `md:` auf 3 Spalten um — auf
Tablet-Portrait (640–767) würden sie sonst zu schmal, Text bricht um,
Value und Suffix verrutschen. Die etwas schmaleren QuickAction-Cards
(nur Icon + Label + Description) dürfen ab `sm:` auf 2 Spalten, weil
kein Umbruch-Risiko besteht. Niemals direkt von 1 → 3 in einem Schritt
— produziert auf der sm-Stufe ein hässliches 2+1-Waisenkind.

### Typografie pro Breakpoint

Nur Page-Headings skalieren. Body / Labels / Mono bleiben konstant.

| Element | Mobile | sm: | lg: |
| --- | --- | --- | --- |
| Page-H1 | `text-2xl` | `sm:text-3xl` | `lg:text-4xl` |
| Section-H2 | `text-lg` | — | — |
| Card-Title | `text-base` | — | — |
| Body / Labels / Mono | fix | — | — |

### Padding-Konventionen

**Main-Content-Container** (wrappt die ganze Seite):

```
px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10
```

**Header-Container** (Top-Nav bzw. Admin-Header):

```
px-4 py-3 sm:px-6
```

**Section-Abstände** auf der Seite:

```
space-y-6 sm:space-y-8
```

Cards und Inline-Content behalten ihre kontextuellen Paddings (siehe
Abschnitt *Spacing* oben).

### Touch-Targets

Alle klickbaren Elemente auf Mobile müssen **≥ 44×44 px tap-area**
haben (iOS-HIG). Konkret in unserem Codebase:

- **Icon-Buttons** (Hamburger, Search-Icon, Theme-Toggle): `h-10 w-10`
  (40 px, mit Hover-Padding effektive Tap-Area ≥ 44)
- **Nav-Items im Drawer**: `min-h-11` (44 px)
- **Pills / Badges mit Link**: `min-h-9` plus adäquates `px-`
- **shadcn Buttons** mit `size="default"`: sind 40 px hoch, tap-ok
- **shadcn Buttons** mit `size="sm"`: 32 px — nur verwenden, wenn ein
  größerer Button daneben steht, oder auf Desktop-only-Flows

### Mobile-Nav-Pattern

Die Top-Nav kollabiert auf `< lg` zu einem Hamburger-Trigger +
Left-Sliding Sheet-Drawer. Die horizontale Nav-Liste ist `hidden
lg:flex`, der Hamburger `lg:hidden`. Die Grenze liegt bewusst bei
`lg:` (1024): im 640–1023-Fenster (Phones-Landscape + Tablets) haben
4 Nav-Links + Search-Trigger + Account-Switcher + Theme + User-Menu
schlicht keinen Platz, selbst nach Kompaktierung — Hamburger-Nav auf
iPad ist etabliertes Pattern. Referenz-Implementierung:

```tsx
// app/(dashboard)/_mobile-nav.tsx
<Sheet open={open} onOpenChange={setOpen}>
  <SheetTrigger
    render={
      <button
        type="button"
        aria-label="Navigation öffnen"
        className="inline-flex h-10 w-10 items-center justify-center
                   rounded-md text-muted-foreground transition-colors
                   hover:bg-muted hover:text-foreground lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>
    }
  />
  <SheetContent side="left" className="flex w-[280px] flex-col p-0">
    <SheetHeader className="border-b">
      <SheetTitle>Navigation</SheetTitle>
    </SheetHeader>
    <nav className="flex-1 space-y-1 p-2">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => setOpen(false)}
          className="flex min-h-11 items-center rounded-md px-3 text-sm ..."
        >
          {item.label}
        </Link>
      ))}
    </nav>
  </SheetContent>
</Sheet>
```

Die Admin-Sidebar nutzt dieselbe Schwelle: statisch `hidden lg:flex`,
darunter `AdminMobileNavTrigger` als Hamburger + Drawer.

**Controls, die im Drawer-Zustand sichtbar bleiben müssen:** Logo (als
Icon-Square), Account-Switcher (kompakt), Search-Trigger (icon-only),
Theme-Toggle, User-Menu. Alles andere gehört in den Drawer.

### Kompaktierung über Breakpoints

Einzelne UI-Elemente haben eigene Responsive-Regeln, die zur
Gesamtgleichung passen:

- **Logo-Label**: `hidden lg:inline` — unter lg zeigt nur das Icon-Square,
  spart Platz für Nav und Search
- **Search-Trigger**: Icon-only bis `lg`, Full-Pill mit `⌘K` erst ab `lg`
- **AccountSwitcher-Name**: `max-w-[90px] sm:max-w-[140px]`
- **AccountSwitcher Typ-Badge** (`personal`/`team`): `hidden sm:inline`
- **Admin-Header „Zurück zum User-Dashboard"**: `hidden sm:inline`,
  darunter nur `Zurück`
- **Admin-Header Sub-Line „Aktionen werden protokolliert"**: `hidden sm:inline`

### Testing-Protokoll

Breakpoint-Schwellen (640, 768, 1024, 1280) sind als Testing-Basis
**nicht** ausreichend — Overflow-Bugs entstehen fast immer **zwischen**
Breakpoints. Die Phase-1-QA hat das schmerzhaft gelernt: „alles grün
bei 375/768/1280" verdeckte 119 reale Violations in anderen Viewports,
die erst das Audit-Script aufgedeckt hat.

**Pflicht-Protokoll vor jedem Design-Commit:**

1. **Visueller 6-State-Check** — drei Viewports × zwei Theme-Modi:

   | Viewport | Pixelbreite | Theme |
   | --- | --- | --- |
   | Mobile | 375 | Light + Dark |
   | Tablet | 768 | Light + Dark |
   | Desktop | 1280 | Light + Dark |

2. **Overflow-Audit-Script** über zehn Zwischen-Breakpoint-Viewports:

   ```bash
   # Dev-Server läuft auf :3000
   pnpm audit:responsive --url /dashboard --auth
   ```

   Viewports: `320, 375, 390, 414, 500, 620, 700, 900, 1100, 1280`.
   Erwartung: **0 Violations** vor Commit. Exit-Code ≠ 0 = Commit
   blockiert.

   Was das Skript findet:
   - `scrollWidth > clientWidth` auf Containern (internal overflow)
   - `rect.right > vw` / `rect.left < 0` (Viewport-Clipping)
   - Per-Nav-Child-Position (erkennt Nav-vs-Search-Trigger-Zusammenstöße)

   Skript-Skips (False-Positive-Filter): `sr-only`-Elemente, bewusste
   `truncate`-Container, `overflow-x: auto/scroll`, `display: none`
   / hidden / zero-size.

3. **Bricht ein State**, wird er **im selben Commit** gefixt — keine
   „okay, das fixen wir später"-Ausnahme. Dashboard-Home ist die
   Referenz; wenn ein Pattern dort nicht existiert, gibt's einen guten
   Grund, es in einer Folge-Seite zu erfinden.

**Aufruf-Varianten:**

```bash
# Einzelne Seite, gated (zieht Session-Cookie aus DB)
pnpm audit:responsive --url /dashboard --auth

# Mehrere Seiten in einem Lauf
pnpm audit:responsive --url /dashboard --url /spaces --url /settings --auth

# Öffentliche Seiten ohne Auth
pnpm audit:responsive --url /login

# Custom-Viewports (z.B. nur Mobile-Bereich debuggen)
pnpm audit:responsive --url /dashboard --auth --viewports 320,375,390
```

**Verifikations-Hilfen für manuelle Debug-Sessions:**

- `window.innerWidth` prüfen, dass der Viewport-Emulator den Wert
  wirklich setzt (Preview-Tools zeigen manchmal kleinere Screenshots,
  als der Viewport tatsächlich ist)
- `getBoundingClientRect()` auf Header-Controls, wenn der Verdacht auf
  Overlap besteht — gibt exakte x/y/w/h aus, enttarnt schnell
  `justify-between`-Zusammenstöße

**Realer Fund, der das Skript gerechtfertigt hat:** Bei Viewports
375–620 wurde die Activity-List von einem einzigen langen MIME-Typ
(`application/vnd.openxmlformats-officedocument.wordprocessingml.document`)
horizontal gesprengt. Die Card war dann 682 px breit trotz 320 px
Viewport. Visuell beim Scrollen unsichtbar (horizontaler Page-Scroll
wird oft übersehen), aber für User katastrophal.

### Anti-Patterns (Responsive-Checkliste vor PR)

- [ ] **Horizontale Scroll-Bars** durch `whitespace-nowrap` ohne
  `overflow-hidden` oder `truncate`
- [ ] **Fixed-Widths** wie `w-[320px]` statt `max-w-*` / fluid-Widths
- [ ] **Touch-Targets unter 44×44 px** auf Mobile (Icon-Buttons, die nur
  `h-8 w-8` sind)
- [ ] **Body-Text kleiner als `text-sm` (14 px)** auf Mobile (außer
  bewusste Mono-Captions mit `font-mono text-[11px]` o.ä.)
- [ ] **Content-dichte Cards (Label + Value + Suffix + Progress)**, die
  ab `sm:` schon 3-spaltig werden — solche Cards brauchen mind. `md:`
  (siehe Grid-Matrix). Auf Tablet-Portrait wirkt sonst der Value-
  Umbruch beim Stacking mit den Nachbar-Cards zusammen chaotisch.
- [ ] **Value + Suffix inline in KPI-Cards** (`<span>42</span> <span
  className="text-sm">von 100</span>` auf gleicher Baseline) — das
  bricht bei schmalen Cards um. Stattdessen: Value eigene Zeile,
  Suffix `mt-1 text-xs` darunter.
- [ ] **Sticky-Header ohne `z-index`-Plan** — aktuell nutzen User-Header
  `z-40`, Admin `z-20`, Sheet-Overlay `z-50`. Daran halten.
- [ ] **Container ohne max-width** — User-Seiten `max-w-5xl` (1024 px),
  Admin `max-w-6xl` (1152 px). Kein freies `w-full` auf Main-Content.
- [ ] **List-Sections in voller Main-Breite** auf Desktop — Rows mit
  kurzem Content (z.B. „Note-Titel · vor 3 Stunden") fluten sonst
  in zu breite Cards. List-Sections bekommen `mx-auto max-w-4xl`
  innerhalb des Main-Containers.
- [ ] **„Test bei 640, 768, 1024 war grün"** ist nicht ausreichend als
  Responsive-Nachweis. `pnpm audit:responsive` mit den 10 Zwischen-
  Breakpoint-Viewports **muss** vor Commit 0 Violations melden.
- [ ] **Elemente, die nur in einem Theme gut aussehen** — muss beides
  testen, nicht nur eins

---

## Beispiel-Komponenten

### KPI-Card (`components/kpi-card.tsx` aus Phase 1)

```tsx
<KpiCard
  label="Storage"
  value="218 MB"
  valueSuffix="von 20 GB"
  progress={{ used: 218_000_000, max: 20_000_000_000 }}
/>
```

Rendert: Eyebrow-Label oben, großer Wert (tabular-nums), darunter Progress-Bar mit `aria-valuenow`, klein-Prozent rechts neben der Bar. Farb-Coding: >80 % → `bg-amber-500`, >95 % → `bg-destructive` (nur diese zwei Ausnahmen von der „keine Tailwind-Farben direkt"-Regel, weil Warn-Signale semantisch sind und nicht dekorativ).

### Button-Varianten

```tsx
<Button>Default</Button>                                {/* bg-primary */}
<Button variant="outline">Secondary</Button>            {/* border + hover:bg-muted */}
<Button variant="ghost">Tertiary</Button>               {/* hover:bg-muted */}
<Button variant="destructive">Delete</Button>           {/* bg-destructive */}
<Button className="bg-brand text-brand-foreground hover:bg-brand/90">CTA</Button>
```

### List-Item (für Recent-Notes / Recent-Files)

```tsx
<Link
  href={`/notes/${n.id}`}
  className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/50"
>
  <span className="truncate">{n.title}</span>
  <span className="shrink-0 font-mono text-xs text-muted-foreground">
    {formatRelative(n.updatedAt)}
  </span>
</Link>
```

### Plan-Badge

```tsx
<Badge variant="outline" className="font-mono text-xs">
  {quota.planId}
</Badge>
```

Keine eingefärbten Badges mehr (`bg-indigo-500/10 text-indigo-700`) — stattdessen Outline + Mono für Plan-IDs.

---

## Dark-Mode-Integration

**`next-themes` ist installiert und gemountet** (siehe `components/theme-provider.tsx`). Toggle sitzt in der Top-Nav (User-Bereich) und in der Admin-Sidebar. Attribute-Mode: `class="dark"` auf `<html>`.

Drei Wahlmöglichkeiten: Light, Dark, System (Default = System, respektiert `prefers-color-scheme`). Persistiert in `localStorage` pro Browser — keine User-Preference in der DB (Follow-up-Epic).

**Hydration:** `<html suppressHydrationWarning>` muss gesetzt sein, weil `next-themes` das `class`-Attribute clientseitig nachträgt. Ist in `app/layout.tsx` eingerichtet.

Für neue Components: **immer beides testen**. Abkürzung im Dev: Toggle im UI + Hard-Refresh.

---

## Migration-Hinweise

- Alte `font-display`-Calls funktionieren weiter (sehen jetzt nur Sans statt Serif aus). Neuer Code nutzt `font-semibold tracking-tight`.
- Alte hardcoded Farben (`text-indigo-700`, `bg-amber-50` etc.) werden im Rollout stufenweise gegen semantische Tokens getauscht. Neuer Code: **nie** hardcoded Tailwind-Farben.
- `--font-serif` + `--font-heading` sind aus `globals.css` entfernt. Alte Tailwind-Klasse `font-serif` / `font-heading` rendert jetzt auf System-Default-Serif — taucht im Code aktuell nicht auf, also unkritisch.

---

## Anti-Patterns — Checkliste vor PR

Wenn in einem Redesign-PR auftaucht:

- [ ] Hardcoded Tailwind-Farben (`text-{color}-{shade}`, `bg-{color}-{shade}`)
- [ ] `bg-gradient-*` / `from-*` / `via-*` / `to-*`
- [ ] `font-display` oder `font-serif` in **neuem** Code
- [ ] Serifen-Italic-Headings
- [ ] `hover:shadow-md` oder größer auf normalen Cards
- [ ] Cards mit `bg-card/50` + Pastell-Tint
- [ ] Lange Prosa-Untertitel unter Page-Headings

→ Review-Kommentar: „Phase-1-Design-System: siehe `docs/DESIGN_SYSTEM.md` → Anti-Patterns".
