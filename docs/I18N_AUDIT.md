# i18n Inner-Layer Audit

**Stand:** 2026-04-18
**Scope:** Innenschicht (Auth, Dashboard, Marketing, Legal-Links, Invites, Mailer-Templates, API-Error-Messages in non-admin-Routes, User-facing Lib-Errors).
**Explizit ausgeschlossen:** `app/(admin)/*`, `app/api/admin/*`, `lib/admin/*`, `components/ui/*` (shadcn Base-UI), Inhalte von `datenschutz`/`impressum` (Legal-Pages bleiben per Anforderung deutsch).

Kein Code wurde im Rahmen dieses Audits geändert — reine Read-Only-Analyse.

---

## 1. Zusammenfassung

| Kennzahl                                              | Wert |
| ----------------------------------------------------- | ---- |
| Geprüfte UI-Dateien (Auth/Dashboard/Marketing/Invites/shared) | 70 |
| Geprüfte API-Route-Verzeichnisse (non-admin)          | 18 |
| Geprüfte Lib-Dateien mit potentiell user-facing Strings | 15 |
| Geprüfte Mailer-Template-Funktionen                   | 8 |
| Gesamt-Leaf-Keys in `messages/de.json` / `messages/en.json` | 527 / 527 |
| Top-Level-Namespaces                                  | 17 (identisch in beiden Locales) |
| Shape-Diskrepanzen `de` ↔ `en`                        | 0 |
| Mailer-Templates vollständig migriert                 | 8 / 8 ✅ |

**UI-Block-Status:**

- ✅ vollständig migriert: **20 Dateien** (29 %)
- ⚠️ teilweise migriert: **35 Dateien** (50 %)
- ❌ komplett/weitgehend hardcoded: **15 Dateien** (21 %)

**Hardcoded-Strings (grobe Schätzung):**

- UI-Block: **~190 Strings** (JSX-Labels, Toasts, Confirm-Dialoge, Empty-States, Form-Labels)
- API-Routes + Lib: **~11 Strings** (kritisch, da sie bei jedem gatet Request über den Draht gehen)
- **Gesamt: ~200 Strings**

**Fehlende Message-Keys (grobe Schätzung):**

- Bestehende Namespaces, die erweitert werden müssen: ~60–80 Keys (`dashboard.overview.*`, `settings.mcp.instructions.*`, `billing.plans.features.*`, `errors.api.session.*`, `errors.api.teams.*`)
- Neue Namespaces, die angelegt werden müssen:
  - `confirmDialogs.*` (konsolidiert die ~10 `confirm()`-Strings)
  - `toasts.*` (konsolidiert generische „gespeichert"/„gelöscht"/„kopiert"-Toasts)
- **Gesamt grob: ~80–100 neue oder zu erweiternde Keys**

---

## 2. Bereichsweise Tabellen

Status-Legende:

- ✅ = vollständig migriert (alle user-facing Strings laufen über `t()`/`useTranslations()`)
- ⚠️ = teilweise migriert (Haupt-UI ja, Randfälle — Toasts, Errors, Enum-Maps — nein)
- ❌ = weitgehend hardcoded (kein oder kaum next-intl-Import, große Anteile direkt im JSX)

Alle Strings-Counts sind Schätzungen auf Basis von Grep-Treffern und Stichproben.

### A. Auth-Bereich (`app/(auth)/*`)

| Datei | Status | Hardcoded-Strings | Kategorien | Besonderheiten |
| --- | --- | --- | --- | --- |
| `app/(auth)/layout.tsx` | ❌ | 2 | UI-Labels | Nur die Footer-Links „Impressum" + „Datenschutz" hardcoded |
| `app/(auth)/login/page.tsx` | ✅ | 0 | — | `useTranslations("auth.login")`, komplett sauber |
| `app/(auth)/register/page.tsx` | ✅ | 0 | — | Sauber |
| `app/(auth)/forgot-password/page.tsx` | ✅ | 0 | — | Sauber |
| `app/(auth)/reset-password/page.tsx` | ✅ | 0 | — | Sauber |
| `app/(auth)/two-factor/page.tsx` | ❌ | ~10 | UI-Labels, Form-Placeholders, Toasts, Confirm-Dialoge | „TOTP-Code" / „Backup-Code"-Umschalter, Enum-Labels im JSX, placeholder-Strings, aria-labels — das einzige i18n-Loch im Auth-Flow |

### B. Dashboard — Spaces (`app/(dashboard)/spaces/*`)

| Datei | Status | Hardcoded-Strings | Kategorien | Besonderheiten |
| --- | --- | --- | --- | --- |
| `spaces/page.tsx` | ❌ | ~7 | UI-Labels, Empty-States | „Noch keine Spaces", Öffnen-Button, Zähler-Labels |
| `spaces/_space-create-dialog.tsx` | ❌ | ~10 | UI-Labels, Form-Placeholders, Toasts | `toast.success("Space angelegt")`, Form-Labels |
| `spaces/_space-delete-button.tsx` | ❌ | 4 | Confirm-Dialoge, Toasts, Error-Messages | `confirm()` mit eingebettetem Namen |
| `spaces/[id]/page.tsx` | ⚠️ | ~8 | UI-Labels | Breadcrumb-Text + Reindex-Controls |
| `spaces/[id]/_bucket-browser.tsx` | ❌ | ~40 | UI-Labels, Toasts, Confirm-Dialoge, Empty-States | **914 LOC** — das größte einzelne Migrations-Target; sollte beim Migrieren auch in Sub-Komponenten gesplittet werden |
| `spaces/[id]/_reindex-button.tsx` | ⚠️ | 3 | Confirm-Dialoge, Toasts | `confirm()` + Success/Error-Toast |

### C. Dashboard — Notes (`app/(dashboard)/notes/*`)

| Datei | Status | Hardcoded-Strings | Kategorien | Besonderheiten |
| --- | --- | --- | --- | --- |
| `notes/page.tsx` | ❌ | ~8 | UI-Labels, Empty-States, Enum-Badges | „für MCP ausgeblendet"-Badge, Filter-Controls |
| `notes/new/page.tsx` | ⚠️ | ~3 | UI-Labels | Seitenrahmen um Editor |
| `notes/[id]/page.tsx` | ⚠️ | ~4 | UI-Labels | Detail-Rand, View-Controls |
| `notes/_markdown.tsx` | ✅ | 0 | — | Reiner Renderer, keine Strings |
| `notes/_note-delete-button.tsx` | ❌ | 3 | Confirm-Dialoge, Toasts | `confirm("Note wirklich löschen?")` |
| `notes/_note-editor-form.tsx` | ⚠️ | ~8 | Form-Placeholders, Toasts, Error-Messages | Save-Paths mit hardcoded Toasts |

### D. Dashboard — Files (`app/(dashboard)/files/*`)

| Datei | Status | Hardcoded-Strings | Kategorien | Besonderheiten |
| --- | --- | --- | --- | --- |
| `files/page.tsx` | ❌ | ~7 | UI-Labels, Empty-States, Enum-Badges | „10 MB"-Helper, „für MCP ausgeblendet" |
| `files/_file-delete-button.tsx` | ❌ | 3 | Confirm-Dialoge, Toasts | `confirm(\`"${name}" wirklich löschen?\`)` |
| `files/_file-uploader.tsx` | ❌ | ~11 | Form-Placeholders, Toasts, Error-Messages | Client-Validation-Messages („Datei ist zu groß" etc.), Progress/Abort-Texte — Hot-Spot für User-Errors |

### E. Dashboard — Settings (`app/(dashboard)/settings/*`)

| Datei | Status | Hardcoded-Strings | Kategorien | Besonderheiten |
| --- | --- | --- | --- | --- |
| `settings/page.tsx` | ✅ | 0 | — | Container; delegiert an `DangerZone`-Helfer |
| `settings/layout.tsx` | ⚠️ | ~3 | UI-Labels | Nav-Wrapper |
| `settings/mcp/page.tsx` | ❌ | ~6 | UI-Labels, Section-Descriptions | Legacy-Tokens-Beschreibung, Client-Setup-Hinweise |
| `settings/mcp/_mcp-instructions.tsx` | ⚠️ | ~10 | UI-Labels, Code-Snippets, Instructions | 146 LOC, eingebettete Schritt-für-Schritt-Anleitungen — komplexer Content, ggf. als MDX auslagern |
| `settings/mcp/_token-create-dialog.tsx` | ⚠️ | 4 | Toasts, Error-Messages, Form-Labels | Nutzt `useTranslations("settings.mcp.create")`, aber Fallback-Error-Texte hardcoded |
| `settings/mcp/_token-list.tsx` | ⚠️ | ~5 | UI-Labels, Confirm-Dialoge | `confirm("Token \"…\" widerrufen? Clients verlieren sofort den Zugriff.")` |
| `settings/storage/page.tsx` | ❌ | ~8 | UI-Labels, Beschreibungen | Provider-Docs-Links, „Konfigurieren"-CTAs |
| `settings/storage/_add-provider-dialog.tsx` | ❌ | ~10 | Form-Placeholders, Toasts, Error-Messages | **428 LOC** — S3/GitHub-Config-Dialog, viele Felder + Validierungs-Texte |
| `settings/storage/_provider-list.tsx` | ⚠️ | ~4 | UI-Labels, Confirm-Dialoge | `confirm("Provider \"…\" wirklich entfernen?")` |
| `settings/embedding-key/page.tsx` | ⚠️ | ~4 | UI-Labels | Kurzer Rahmen |
| `settings/embedding-key/_embedding-key-manager.tsx` | ⚠️ | ~4 | Toasts, Confirm-Dialoge | Zweifacher `confirm()` mit langem Text |
| `settings/team/page.tsx` | ⚠️ | ~2 | UI-Labels | Nutzt `useTranslations("settings.team.overview")` |
| `settings/team/_name-form.tsx` | ⚠️ | ~4 | Toasts, Error-Messages | Größtenteils migriert, nur Error-Pfade hardcoded |
| `settings/team/_delete-card.tsx` | ⚠️ | ~5 | UI-Labels, Confirm-Dialoge, Toasts | Uses `useTranslations("settings.team.delete")`, Abbruch-Toasts aber nicht |
| `settings/team/members/page.tsx` | ⚠️ | ~2 | UI-Labels | Sauber bis auf Rand-Labels |
| `settings/team/members/_members-table.tsx` | ⚠️ | ~4 | Enum-Labels, Toasts | `t("removeConfirm", …)` läuft durch i18n, aber rollenspezifische Badges gemischt |
| `settings/team/members/_pending-invites.tsx` | ⚠️ | ~3 | Toasts, Confirm-Dialoge | `t("revokeConfirm", …)` sauber, resend-Toast hardcoded |

### F. Dashboard — Profile (`app/(dashboard)/profile/*`)

| Datei | Status | Hardcoded-Strings | Kategorien | Besonderheiten |
| --- | --- | --- | --- | --- |
| `profile/page.tsx` | ✅ | 0 | — | Container |
| `profile/layout.tsx` | ⚠️ | 0 | — | Nutzt next-intl für Nav |
| `profile/_section-nav.tsx` | ⚠️ | ~4 | UI-Labels | Gemischte Navigation-Labels |
| `profile/_overview-form.tsx` | ❌ | ~8 | Toasts, Error-Messages, Form-Placeholders | Avatar-Upload-Errors („Bild ist zu groß (max 2 MB)"), Profil-Save-Errors |
| `profile/_locale-switcher.tsx` | ⚠️ | 2 | Enum-Labels | `useTranslations("profile.locale")` aber Optionen `"Deutsch"` / `"English"` als Option-Text inline (ironisch) |
| `profile/_two-factor-section.tsx` | ❌ | ~12 | UI-Labels, Form-Placeholders, Toasts, Confirm-Dialoge | `<img>`-Warning + Security-Text, „Authenticator-App"-Abschnitte |
| `profile/_change-password-dialog.tsx` | ⚠️ | ~6 | Form-Placeholders, Toasts, Error-Messages | Größtenteils migriert, Feh­ler-Pfade offen |
| `profile/_danger-zone.tsx` | ❌ | ~8 | UI-Labels, Confirm-Dialoge, Toasts, Error-Messages | Delete-Flow komplett deutsch: „Check deine Mails", „Account endgültig löschen?" |
| `profile/_data-portability.tsx` | ⚠️ | ~5 | UI-Labels, Toasts | Export-Button + Progress-Texte |
| `profile/security/page.tsx` | ⚠️ | 0 | — | Wrapper, delegiert an `_two-factor-section` |
| `profile/data/page.tsx` | ⚠️ | 0 | — | Wrapper, delegiert an `_data-portability` |

### G. Dashboard — Sonstige (Home + Shared-Islands + Layout)

| Datei | Status | Hardcoded-Strings | Kategorien | Besonderheiten |
| --- | --- | --- | --- | --- |
| `(dashboard)/layout.tsx` | ✅ | 0 | — | Nav-Array komplett via `getTranslations("dashboard.nav")` |
| `(dashboard)/_account-switcher.tsx` | ✅ | 0 | — | `useTranslations("accountSwitcher")` + `useTranslations("enums.role")` |
| `(dashboard)/_footer.tsx` | ❌ | 3 | UI-Labels | „Impressum", „Datenschutz", „Kontakt" inline (gleiche Muster wie Auth-Layout) |
| `(dashboard)/_mcp-hidden-toggle.tsx` | ❌ | 5 | Toasts, Aria-Labels, Title | Success-/Error-Toasts + sprechende aria-labels |
| `(dashboard)/_nav-link.tsx` | ✅ | 0 | — | Reiner Presentational-Wrapper; Labels werden als Children gereicht |
| `(dashboard)/_search-palette.tsx` | ⚠️ | ~18 | UI-Labels, Enum-Labels, Error-Messages | COMMANDS-Array mit Labels und deutschen Keywords für die Fuzzy-Suche — größte Einzel-Liste an Strings in den shared-Islands |
| `(dashboard)/_user-menu.tsx` | ⚠️ | 2 | UI-Labels | „Admin-Bereich"-Eintrag bewusst deutsch (einziger Touchpoint für Admins) |
| `dashboard/page.tsx` | ❌ | ~15 | UI-Labels, Empty-States, Quick-Actions, Chart-Labels | 325 LOC — Home-Screen vom Dashboard, hoch-frequentiert |
| `dashboard/_onboarding-card.tsx` | ❌ | ~12 | UI-Labels, Step-Labels | „Schritt 1/2/3", Step-Beschreibungen |
| `dashboard/_quota-ring.tsx` | ✅ | 0 | — | Nutzt `toLocaleString("de-DE")`, Labels kommen als Props |

### H. Dashboard — Billing (`app/(dashboard)/billing/*`)

| Datei | Status | Hardcoded-Strings | Kategorien | Besonderheiten |
| --- | --- | --- | --- | --- |
| `billing/page.tsx` | ❌ | ~8 | UI-Labels, Alert-Messages | PayPal-Cancel-Banner, Plan-Badge, Expiry-Kopie |
| `billing/layout.tsx` | ⚠️ | ~2 | UI-Labels | Nav-Wrapper (Overview/Plans/Invoices) |
| `billing/_upgrade-button.tsx` | ⚠️ | ~2 | Toasts, UI-Labels | Error-Fallback hardcoded |
| `billing/plans/page.tsx` | ❌ | ~10 | UI-Labels, Plan-Features | 140 LOC; Feature-Listen pro Plan inline, sollten aus DB oder `billing.plans.features.*`-Namespace kommen |
| `billing/invoices/page.tsx` | ❌ | ~6 | UI-Labels, Empty-States | „Keine Rechnungen — du bist auf dem Free-Plan" etc. |
| `billing/success/page.tsx` | ✅ | 0 | — | `useTranslations("billing.success")` |

### I. Marketing + Legal-Wrapper (`app/(marketing)/*`, `app/(legal)/*` — **nur Rahmen, nicht Inhalt**)

| Datei | Status | Hardcoded-Strings | Kategorien | Besonderheiten |
| --- | --- | --- | --- | --- |
| `(marketing)/layout.tsx` | ❌ | 4 | UI-Labels | „Login"-Button, „Impressum", „Datenschutz", Kontakt-Email |
| `(marketing)/page.tsx` | ✅ | 0 | — | Komplett via `getTranslations("marketing.comingSoon")` |
| `(legal)/layout.tsx` | ✅ | 0 | — | Nur Struktur, kein Text |
| `(legal)/datenschutz/page.tsx` | n/a | ~100 | Content | **Bewusst deutsch** (DSGVO/Rechtliches) — NICHT migrieren. Nur als Hinweis: wird nie übersetzt werden, weil es nur auf Deutsch rechtssicher ist. |
| `(legal)/impressum/page.tsx` | n/a | ~80 | Content | **Bewusst deutsch** — siehe oben. |

### J. Invite-Flow (`app/invites/*`)

| Datei | Status | Hardcoded-Strings | Kategorien | Besonderheiten |
| --- | --- | --- | --- | --- |
| `invites/accept/page.tsx` | ✅ | 0 | — | `getTranslations("invites.accept")` + `common.buttons` |
| `invites/accept/_accept-button.tsx` | ✅ | 0 | — | Error-Codes werden via `translateError()`-Utility lokalisiert |

### K. Geteilte Komponenten (`components/*`)

Im Repo existiert **nur `components/ui/*`** (shadcn Base-UI). Diese sind laut Scope ausgeschlossen — dort stehen ohnehin keine User-facing deutschen Strings, nur aria-labels und Patterns, die der Konsument per Prop überschreibt. **Keine Migrations-Arbeit in diesem Bereich.**

### L. Email-Templates (`lib/mailer/templates.ts`)

Alle 8 Exports laufen durch `loadEmailStrings(locale, section)` → `getTranslations({ locale, namespace: "email.${section}" })`. Keine hardcoded Strings. Datums-Formatter nutzt `Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-US", …)` — korrekt locale-aware.

| Template | Status | Notiz |
| --- | --- | --- |
| `verifyEmailTemplate` | ✅ | de + en vollständig |
| `resetPasswordTemplate` | ✅ | de + en vollständig |
| `deleteAccountTemplate` | ✅ | de + en vollständig |
| `changeEmailTemplate` | ✅ | de + en vollständig |
| `twoFactorOtpTemplate` | ✅ | de + en vollständig |
| `teamInviteTemplate` | ✅ | de + en vollständig |
| `ownershipTransferredNotificationTemplate` | ✅ | Beide Locales, Teams-V1-Feature |
| `ownershipTransferredConfirmationTemplate` | ✅ | Beide Locales, Teams-V1-Feature |

**Keine offenen Punkte in diesem Bereich.**

### M. Error-Messages in API-Routes (non-admin) (`app/api/*`)

Gruppierung pro Route-Familie. Zahlen sind echte Grep-Treffer, nicht geschätzt.

| Gruppe | Status | Hardcoded-Strings | Übersetzt? | Notiz |
| --- | --- | --- | --- | --- |
| `app/api/accounts/**` | ✅ | 0 | n/a (keine Custom-Messages) | Nur Framework-Helper (`apiError`, `notFound`) — englische Defaults |
| `app/api/auth/**` | ✅ | 0 | n/a | Delegation an Better-Auth |
| `app/api/embedding-key/**` | ✅ | 0 | n/a | Standard-Helper |
| `app/api/export/**` | ✅ | 0 | n/a | Standard-Helper |
| `app/api/files/**` | ✅ | 0 | n/a | Quota-Errors laufen durch `lib/quota.ts` (englisch) |
| `app/api/import/**` | ✅ | 0 | n/a | Liefert `ImportResult.reason` als Code-String |
| `app/api/invites/**` | ⚠️ | 0 | code-basiert | `InviteError.code` — Frontend übersetzt; `.message` kann englisch oder deutsch sein, wird aktuell nicht für User-Display genutzt |
| `app/api/invoices/**` | ✅ | 0 | n/a | — |
| `app/api/mcp/**` | ✅ | 0 | n/a | MCP-Tool-Errors englisch (intended) |
| `app/api/notes/**` | ✅ | 0 | n/a | — |
| `app/api/palette/**` | ✅ | 0 | n/a | — |
| `app/api/paypal/**` | ✅ | 0 | n/a | Business-Errors englisch |
| `app/api/profile/**` | ✅ | 0 | n/a | — |
| `app/api/search/**` | ✅ | 0 | n/a | — |
| `app/api/spaces/**` | ✅ | 0 | n/a | Englische Standard-Errors |
| `app/api/storage-providers/**` | ❌ | **5** | nein | Zod-Regex-Messages + Connection-Test-Wrapper sind deutsch: „Ungültiger GitHub-Owner", „Ungültiger Repo-Name", „Ein Provider mit diesem Namen existiert bereits.", `\`Verbindungstest fehlgeschlagen: ${msg}\``, `\`GitHub-Verbindungstest fehlgeschlagen: ${msg}\`` |
| `app/api/teams/**` | ⚠️ | code-basiert | teilweise | `TeamError.code` wird vom Frontend übersetzt; die deutschen `.message`-Strings aus `lib/teams/*` landen aber trotzdem im Error-Body |
| `app/api/tokens/**` | ✅ | 0 | n/a | — |

### N. Error-Messages in Lib (`lib/*` — außer `lib/admin/*`)

| Datei | Status | Hardcoded-Strings | Notiz |
| --- | --- | --- | --- |
| `lib/api/errors.ts` | ✅ | 0 | Englische Default-Messages (`"Unauthorized"`, `"Not found"`, …). Framework-OK. |
| `lib/api/session.ts` | ❌ | **2** | Zeile 45: `throw new ApiAuthError("Konto gesperrt", 403)`; Zeile 75: `throw new ApiAuthError("Admin-Berechtigung erforderlich", 403)`. **Surface-Impact hoch** — jeder authentifizierte Call kann bei gesperrtem Account den deutschen Text zurückgeben. Für `Admin-Berechtigung` in diesem Audit streng genommen out-of-scope (Admin-Kontext), wird aber von `requireAdminSession()` auch in non-admin-Paths aufgerufen, wenn dort irrtümlich aufgerufen. |
| `lib/teams/create.ts` | ⚠️ | **1** | Zeile 62: `TeamError("CREATE_DISABLED", "Team-Erstellung ist derzeit nicht freigeschaltet.")`. Die deutsche Variante **existiert bereits** als Key `errors.api.team.createDisabled` in `messages/de.json` — der Throw-Site muss nur umgestellt werden, dass er nicht mehr den Text mit-transportiert. |
| `lib/teams/*.ts` (invites, members, transfer, etc.) | ⚠️ | ~3 | Einige `TeamError`/`InviteError` tragen weiterhin deutsche `.message` — `.code` ist der autoritative Kanal, aber die Message wird manchmal direkt an `apiError()` gereicht. |
| `lib/quota.ts` | ✅ | 0 | Englische `QUOTA:…`-Codes + strukturierte `reason`-Felder. Frontend übersetzt. |
| `lib/storage/github.ts` | ❌ | **4** | Throw-Messages in `ref()` und `testConnection()`: „GitHub: Repo … nicht erreichbar", „Token ungültig oder abgelaufen.", „Zugriff verweigert — Token braucht repo-Scope, oder Rate-Limit erreicht.", „Repo nicht gefunden — oder Token hat keinen Zugriff." — werden im storage-providers-Route in einen weiteren deutschen Wrapper gepackt |
| `lib/storage/{index,s3,vercel-blob}.ts` | ✅ | 0 | — |
| `lib/space-import.ts` | ✅ | 0 | Strukturierte `reason`-Felder |
| `lib/mcp/*.ts` | ✅ | 0 | Englische Tool-Error-Messages (Standard für MCP) |
| `lib/billing/reconcile.ts` | ✅ | 0 | Englische `reportOperationalIssue`-Keys |
| `lib/audit/log.ts` | ✅ | 0 | — |
| `lib/rate-limit.ts` | ✅ | 0 | — |
| `lib/ops-alerts.ts` | ✅ | 0 | Intern, nicht user-facing |

---

## 3. Fehlende Message-Namespaces

### Bestehende, aber zu erweiternde Namespaces

| Namespace | Aktueller Inhalt | Zu ergänzen |
| --- | --- | --- |
| `dashboard.*` | Nur `nav` + `overview.{stats,recent}` (16 Keys) | Home-Hero („Willkommen", Unter-Text), Empty-States für Recent-Notes/Files, Quick-Actions (≥ 15 Keys), Quota-Warn-Texte, `dashboard.onboarding.*` mit Step-Labels und -Beschreibungen (~10 Keys) |
| `notes.*` | Nur `form` + `detail` (9 Keys) | List-Page Empty-States, Badge-Labels („für MCP ausgeblendet"), Toast-Messages für save/delete/update (~6 Keys) |
| `files.*` | Nur Table-Header (8 Keys) | Uploader-Fehlermeldungen (Client-Validierung), Progress-Texte, Size-Limit-Helper, Empty-State (~10 Keys) |
| `settings.mcp.instructions.*` | Knappe Setup-Labels | Schritt-für-Schritt-Text, Code-Snippet-Umrahmungen (~8 Keys) oder den ganzen Block als MDX extern |
| `settings.storage.add.*` | Add-Dialog Basis | Fehler-Cases für S3/GitHub-Connection-Test, Form-Validierungs-Texte (~6 Keys) |
| `billing.plans.features.*` | Plan-Namen + Preise | Feature-Listen je Tier (~20 Keys) — alternativ aus `plans`-DB |
| `billing.invoices.*` | — | Empty-State, Status-Badges, Download-Label (~4 Keys) |
| `errors.api.session.*` | — | `accountDisabled`, `adminRequired`, `roleMismatch` (~3 Keys) |
| `errors.api.team.*` | Teilweise | `createDisabled` existiert, aber `lib/teams/create.ts` nutzt den Key noch nicht |
| `errors.api.storageProvider.*` | — | `invalidGitHubOwner`, `invalidRepoName`, `duplicateProviderName`, `connectionTestFailed`, `githubConnectionTestFailed` (~5 Keys) |
| `errors.github.*` | — | Provider-spezifische Error-Messages aus `lib/storage/github.ts` (~4 Keys) |
| `profile.*` | Komplett | Mini-Gap: Locale-Switcher-Optionen („Deutsch" / „English") hart kodiert statt aus `enums.locale.*` |

### Neu anzulegende Namespaces

| Namespace | Zweck | Voraussichtliche Keys |
| --- | --- | --- |
| `confirmDialogs.*` | Konsolidiert die ~10 `confirm()`-Strings aus Delete-/Revoke-Flows | ~10 Keys (`deleteSpace`, `deleteNote`, `deleteFile`, `revokeToken`, `removeProvider`, `removeMember`, `revokeInvite`, `clearEmbeddingKey`, `reindexSpace`, `deleteAccount`) |
| `toasts.*` | Konsolidiert generische Status-Toasts | ~8 Keys (`savedSuccess`, `deletedSuccess`, `copiedSuccess`, `uploadSuccess`, `genericError`, `networkError`, `tooLarge`, `unauthorized`) |
| `dashboard.onboarding.*` | Dedizierter Namespace für die Onboarding-Card | ~12 Keys |

**Geschätzte Gesamtausweitung der Message-Dateien:** +80 bis +100 Keys je Locale (derzeit 527 → ~610).

---

## 4. Aufwand-Schätzung (grob)

Basis: Erfahrung aus dem vorherigen i18n-Sweep + Code-Größe. „Session-Zeit" = Wallclock eines Claude-Code-Laufs, der strukturiert migriert inkl. Typecheck.

| Bereich | Aufwand | Dauer (ca.) | Begründung |
| --- | --- | --- | --- |
| **A. Auth-Rest** (Two-Factor-Page + Layout-Footer) | **Klein** | < 1 h | Eine mittlere Datei + 2 Layout-Links; passt problemlos in eine Session |
| **B. Spaces** | **Groß** | 3–4 h | `_bucket-browser.tsx` mit 914 LOC ist der Brocken; parallel viele ähnliche Create/Delete-Controls |
| **C. Notes** | **Mittel** | 1.5–2 h | 6 Files, Standard-Patterns, Editor-Form ist mittel-kompliziert |
| **D. Files** | **Mittel** | 1.5 h | Uploader hat die interessanten Client-Validierungen; sonst geradeaus |
| **E. Settings (alle Sub-Pages)** | **Groß** | 4–5 h | 17 Files, Storage-Provider-Dialog und MCP-Instructions sind die Brocken. In zwei Sub-Sessions teilbar: 1) MCP+Storage+Embedding, 2) Team-Sub-Settings |
| **F. Profile** | **Mittel-Groß** | 2–3 h | 2FA-Section ist komplex (Setup-Flow mit mehreren Schritten); Avatar-Upload + Delete-Flow haben viele Edge-Cases |
| **G. Dashboard-Home + Shared-Islands** | **Mittel** | 2 h | Dashboard-Home (325 LOC) + Search-Palette (COMMANDS-Array) sind die Hauptarbeit; Footer ist trivial |
| **H. Billing** | **Mittel** | 1.5–2 h | Plans-Page hat Feature-Listen, sonst Standard |
| **I. Marketing-Layout** | **Klein** | < 30 Min | Nur 4 Strings |
| **J. Invite-Flow** | **Keiner** | — | ✅ komplett fertig |
| **K. components/** | **Keiner** | — | Out-of-scope |
| **L. Email-Templates** | **Keiner** | — | ✅ komplett fertig |
| **M. API-Routes (non-admin)** | **Klein-Mittel** | 1.5 h | Fokus auf `storage-providers/route.ts` + `lib/api/session.ts` + `lib/teams/create.ts` + `lib/storage/github.ts` — zusammen ~11 Strings, aber Session-Throws brauchen Locale-Threading (siehe Risiken) |
| **N. Sammel-Namespace-Erweiterung** | **Klein** | 45 Min | `confirmDialogs` + `toasts` + `errors.api.session` anlegen, beide Locales, Test-Coverage |

**Gesamt-Grobzeit:** ~20–24 Stunden Claude-Code-Zeit, sinnvoll in 6–8 Sessions aufteilbar.

---

## 5. Risiken & Stolperfallen

1. **`lib/api/session.ts` — `requireSession()` kennt keine Locale.**
   Das ist der größte architektonische Knoten. Optionen:
   - `requireSession({ locale })` als optionalen Parameter (Caller müssen Locale besorgen)
   - Locale aus `users.preferred_locale` per DB-Query innerhalb von `requireSession` ziehen (eine zusätzliche Query pro Call — akzeptabel, da die Funktion ohnehin einen User-Row zieht)
   - In der Session-Error schon nur einen **Code** werfen (`"session.account_disabled"`) und das Mapping im Frontend oder in einer dedizierten `authErrorResponse(err)`-Erweiterung durchführen. **Empfohlen**, weil es ohne Parameter-Threading auskommt und die Semantik explizit ist.

2. **`confirm()`-Dialoge sind alle native Browser-Dialoge.**
   Sie liefern ein blockierendes Boolean zurück. Wenn wir sie auf controlled `Dialog`-Components migrieren, müssen Call-Sites async werden. Zwei Pfade möglich:
   - (a) Pragmatisch: `confirm()`-Strings trotzdem durch `t()` aufgelöst — das funktioniert, weil `confirm()` einen String akzeptiert. Kein Refactor nötig. **Empfohlen** für MVP.
   - (b) Sauber: controlled Dialog mit Confirm-Text aus `confirmDialogs.*`. Ist Follow-up-Arbeit.

3. **Inline Enum-zu-Label-Mappings.**
   In `_members-table.tsx`, `_bucket-browser.tsx` etc. stehen Patterns wie `role === "owner" ? "Besitzer" : …`. Diese müssen auf `t(\`enums.role.${role}\`)` umgestellt werden. `enums.role.*` existiert bereits — nur die Call-Sites sind die Arbeit. Achtung: Legacy-Werte `editor`/`reader` (aus `space_members`) brauchen ggf. Alias-Keys in `enums.role.*`, falls das bisher nicht existiert.

4. **COMMANDS-Array im Search-Palette.**
   Das Array wird während des Renderings gebaut. In Client-Components geht das problemlos — `const COMMANDS = [{ label: t("commands.newNote"), keywords: [t("commands.newNote.keyword1")] }, …]`. Aber: Fuzzy-Match-Keywords sind aktuell deutsch-only; für echtes Multi-Lingual-Suchen müssten die Keywords **beide Locales** abdecken oder die Query auf die aktive Locale locken.

5. **Legal-Inhalte (Impressum, Datenschutz) dürfen NICHT migriert werden.**
   Ist oben dokumentiert, muss in PR-Beschreibung wiederholt werden, damit kein Rewiew-Missverständnis passiert.

6. **Datums-/Zahlen-Formatter inkonsistent.**
   Einige Dateien nutzen `toLocaleDateString("de-DE")` / `toLocaleString("de-DE")` direkt (z.B. in `_quota-ring.tsx`, `spaces/page.tsx`). Das muss beim Migrieren mit erledigt werden — entweder auf `useFormatter()` von next-intl oder über einen zentralen `formatDate(iso)`-Helper, der die aktive Locale respektiert. Es gibt bereits `app/(admin)/_charts/formatters.ts`, aber das ist admin-scoped (deutsch-only) und darf nicht als Basis verwendet werden.

7. **Storage-Provider-Connection-Test errors werden doppelt gewrappt.**
   `lib/storage/github.ts` wirft schon einen deutschen String, `app/api/storage-providers/route.ts` wrappt ihn noch mal in einen deutschen Wrapper. Beim Migrieren: Provider gibt strukturierte Error-Codes zurück, Route mappt sie auf die passende lokalisierte Message. Sonst ergibt sich komisches „GitHub-Verbindungstest fehlgeschlagen: GitHub: Repo nicht erreichbar" doppelt-gemoppelt.

8. **Zod-Schema-Level-Messages.**
   `app/api/storage-providers/route.ts` hat `.regex(…, "Ungültiger GitHub-Owner")` direkt im Zod-Schema. Migration-Pattern: entweder das Schema in einer Factory bauen, die die Messages via `getTranslations` einspritzt, oder — pragmatischer — Codes werfen und im Frontend übersetzen.

9. **`InviteError`/`TeamError`-`.message`-Feld ist ein schiefes Design.**
   Die Klassen haben ein `.code` + optional `.message`. Frontend erwartet `.code`, Code liefert aber auch `.message` — und manche Routen reichen die Message durch. Empfehlung: beim Migrieren die `.message`-Felder entweder komplett leer lassen (dann ist es eindeutig: nur Code zählt) oder die Messages englisch halten als Dev-Info.

10. **Dead-Key-Erkennung.**
    Der Namespace-Audit sieht keine offensichtlichen orphaned Keys, aber `settings.*` hat 121 Keys — beim Erweitern lohnt ein `grep`-Run pro neu-referenziertem Key, um zu verhindern, dass wir tote Keys ansammeln.

---

## 6. Empfehlung Migrations-Reihenfolge

Wünschenswerte Reihenfolge, sortiert nach Abhängigkeit und User-Value:

### Runde 1 — Fundamente legen (parallelisierbar, 2–3 Sessions)

1. **Session-Errors + Namespace-Erweiterungen** (`lib/api/session.ts` → Code-basiert; `errors.api.session.*`, `confirmDialogs.*`, `toasts.*` anlegen). Klein, aber Voraussetzung für viele andere Stellen.
2. **Storage-Provider-API-Errors** (`app/api/storage-providers/route.ts` + `lib/storage/github.ts` + `lib/teams/create.ts`). Zusammen ~11 Strings, alle in einer Session machbar.

### Runde 2 — Hoch-frequentierte UI-Bereiche (User-Value-First, 3 Sessions parallelisierbar)

3. **Dashboard-Home + Search-Palette** (G) — das erste, was der User nach Login sieht.
4. **Spaces** (B) — Kern-UX, `_bucket-browser` ist der größte Brocken; ggf. in zwei Sessions splitten: (a) Liste + Create/Delete, (b) Detail + Bucket-Browser.
5. **Files** (D) — Uploader ist der Hot-Spot für User-Error-Messages.
6. **Notes** (C) — Editor-Form + Delete-Flow.

### Runde 3 — Settings (eine längere, fokussierte Session oder zwei parallele)

7. **Settings — Personal-Scope** (MCP, Storage, Embedding-Key) — parallelisierbar mit Runde 2, wenn das Team erweitert wäre; als Solo-Path sequenzial nach Runde 2.
8. **Settings — Team-Scope** (Team-Page, Members-Table, Pending-Invites, Delete-Card).

### Runde 4 — Profile + Billing (medium-frequentiert, parallelisierbar)

9. **Profile** (F) — 2FA + Avatar + Danger-Zone. Die 2FA-Section ist der Zeitfresser.
10. **Billing** (H) — Plans-Page mit Feature-Listen (ggf. aus DB).

### Runde 5 — Rest (< 1 h gesamt)

11. **Auth Two-Factor-Page** (A) + **Auth-Layout-Footer** + **Marketing-Layout** (I) — kleine Reste, alle in einer Session.

### Was parallel geht

- Runde 2 (Dashboard/Spaces/Files/Notes) und Runde 3 (Settings) haben **keine gegenseitige Abhängigkeit**. Wenn mehrere Sessions parallel möglich sind: beide gleichzeitig anziehen, nachdem Runde 1 steht.
- Runde 1 muss sequenziell gemacht werden, weil Runde 2+ auf den erweiterten Namespaces aufbaut.
- Typecheck nach jeder Runde; Namespaces sortiert in `de.json` und `en.json` einfügen, damit Diffs klein bleiben.

### Nicht migrieren

- Legal-Inhalte (`datenschutz/page.tsx`, `impressum/page.tsx`): bleiben deutsch-only per Anforderung.
- `lib/api/session.ts` Zeile 75 (`Admin-Berechtigung erforderlich`): wird vom Admin-Bereich konsumiert und ist per Scope-Definition ebenfalls deutsch-only. Kann trotzdem sauber einen Code werfen — dann ist das Text-Mapping zentral.
