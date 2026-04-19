# User-Scope Routen-Referenz

Einseitige Übersicht über alle User-Scope-Routen nach Abschluss des
Settings-Redesigns. Für Admin-Routen siehe `docs/ADMIN_DESIGN.md`.

## Routen-Struktur

| Route | Zweck | Guard | Struktur-Typ |
|---|---|---|---|
| `/dashboard` | Landing-Home — Quick-Actions, KPIs, jüngste Aktivität | `requireSessionWithAccount()` | Single-Page, Hero-Header |
| `/profile` | Persönlicher Avatar + Name + Email + Sprache | `requireSessionWithAccount()` | Tabs (3) |
| `/profile/security` | Passwort, 2FA, aktive Sessions | `requireSessionWithAccount()` | Tab |
| `/profile/data` | Daten-Export + **Konto-Löschen** (einzige Stelle) | `requireSessionWithAccount()` | Tab |
| `/settings/general` | Account-Name + Plan + Storage + Embedding-Key (BYOK) | `requireSessionWithAccount()` | Tabs (4), Widget-Dashboard |
| `/settings/mcp` | MCP-Tokens + OAuth-Instruktionen | `requireSessionWithAccount()` | Tab |
| `/settings/storage` | S3-/GitHub-Provider-Verwaltung | `requireSessionWithAccount()` | Tab |
| `/settings/billing` | Plan-Status + Rechnungen (Single-Page) | `requireSessionWithAccount()` | Tab |
| `/settings/billing/plans` | Plan-Wechsel (Conversion-Flow) | `requireSessionWithAccount()` | Sub-Route |
| `/settings/billing/success` | PayPal-Return-Handler | `requireSessionWithAccount()` | Flow-Return |
| `/team` | Team-Übersicht mit Widgets + Edit + Danger-Zone | `requireTeamAccount()` | Tabs (3), Widget-Dashboard |
| `/team/members` | Mitglieder + Invites | `requireTeamAccount()` | Tab |
| `/team/security` | SSO-Konfiguration (Phase-3-Shell) | `requireTeamAccount()` | Tab |

## Permission-Modell

### `requireSessionWithAccount()`

Basic-Auth-Gate. Rejects non-authenticated via `ApiAuthError` (→ redirect
zu `/login`). Löst den aktiven Account auf (Personal oder Team via
AccountSwitcher). Rolle wird mitgeliefert für Sub-Page-Checks.

### `requireTeamAccount()`

Zusätzliche Bedingung `accountType === "team"`. Personal-Accounts landen
mit 308 auf `/dashboard?teamRequired=1` (plus Client-Toast, Query-Param
wird via `router.replace` entfernt). Aktiv im `/team/*`-Layout.

## Destructive-Actions (single-source-of-truth)

| Action | Nur erreichbar unter | Confirm-Pattern |
|---|---|---|
| Konto löschen | `/profile/data` → Danger-Zone-Card | Email-Echo |
| Team löschen | `/team` → Danger-Zone-Card (nur Owner) | Team-Name-Echo |
| Session widerrufen | `/profile/security` | kein Echo (nicht destructive) |
| Token widerrufen | `/settings/mcp` | Confirm-Dialog |

Das heisst: im `/settings/*`-Bereich gibt es **keine** Destructive-
Actions auf Account-Ebene. Wer das Konto löschen will, findet es nur
auf `/profile/data`.

## Tab-Navigation pro Bereich

```
/profile/*
    [Übersicht* | Sicherheit | Daten]

/settings/*
    [Allgemein* | MCP | Storage | Billing]

/team/*
    [Übersicht* | Mitglieder | Sicherheit]
```

Alle drei Bereiche nutzen dieselbe `SectionNav`-Primitive — identisches
Styling (Underline auf Active-Tab, `text-sm`, `border-b pb-1`). Tab-
Wechsel ist idempotent (kein Flash, kein Scroll-Jump).

## Legacy-Redirects

Alle permanent (308). In `next.config.ts`:

| Alte URL | Neue URL | Block |
|---|---|---|
| `/settings` | `/settings/general` | Block 2 (vorheriger Refactor) |
| `/billing` | `/settings/billing` | Block 2 |
| `/billing/:path*` | `/settings/billing/:path*` | Block 2 |
| `/settings/team` | `/team` | Block 3 |
| `/settings/team/:path*` | `/team/:path*` | Block 3 |

## Design-Prinzipien

Siehe `docs/USER_SETTINGS_DESIGN.md` für die fünf verbindlichen
Regeln (Tabs, Danger-Zone, Card-in-Card, Meta-Info-Placement,
Conversion-Flows).

## Abgrenzung zum Admin-Scope

Admin-Routen liegen unter `/admin/*`, haben eigene Layout-Chrome
(`/admin/_sidebar.tsx`), eigene Typografie (`text-lg sm:text-xl` H1s),
eigenes `<AdminPageHeader>`. Siehe `docs/ADMIN_DESIGN.md`.

**Keine User-Scope-Komponente referenziert Admin-Komponenten**, und
keine Admin-Komponente referenziert User-Scope-Komponenten. Die
beiden Scopes sind bewusst komplett getrennt.
