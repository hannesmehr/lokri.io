# SSO-Setup — Microsoft Entra ID

**Stand:** Phase 1, Phase 2 und Phase 3 abgeschlossen. Team-Owner
können SSO jetzt ohne Super-Admin-Hilfe selbst konfigurieren, inklusive
Admin-Consent-Link und Email-First-Login.

## Überblick

lokri.io unterstützt SSO für **Team-Accounts** über Microsoft Entra ID
(OIDC). Personal-Accounts bleiben auf Email/Passwort. SSO ist strikt
Team-Eigenschaft, kein User-Flag — ein User kann simultan per Passwort
in seinen Personal-Account und per Entra in Team X eingeloggt sein.

### Login-Round-Trip (ASCII)

```
╔══════════════╗                                         ╔══════════════╗
║   Browser    ║                                         ║   lokri.io   ║
╚══════╤═══════╝                                         ╚══════╤═══════╝
       │                                                        │
       │  1. GET /api/auth/sso-discovery?email=u@firma.de        │
       ├───────────────────────────────────────────────────────▶│
       │                                                        │
       │  2. { ssoEnabled: true, signInUrl: ".../sso/sign-in" }  │
       │◀───────────────────────────────────────────────────────┤
       │                                                        │
       │  3. Browser navigiert zur signInUrl                     │
       ├───────────────────────────────────────────────────────▶│
       │                                                        │
       │                 ┌──────────────────────────────────────┤
       │                 │ 3a. Load team_sso_configs            │
       │                 │ 3b. Generate state + codeVerifier +  │
       │                 │     nonce; persist in verifications  │
       │                 │ 3c. Build Entra authorization URL    │
       │                 └──────────────────────────────────────┤
       │                                                        │
       │   4. 302 Redirect to login.microsoftonline.com/common  │
       │◀───────────────────────────────────────────────────────┤
       │                                                        │
       │                   ╔═══════════════════╗                │
       │  5. Entra login   ║  Microsoft Entra  ║                │
       ├──────────────────▶║                   ║                │
       │  6. Entra Callback║                   ║                │
       │◀──────────────────╚═══════════════════╝                │
       │                                                        │
       │  7. GET /api/auth/sso/callback?state=...&code=...       │
       ├───────────────────────────────────────────────────────▶│
       │                                                        │
       │                 ┌──────────────────────────────────────┤
       │                 │ 7a. Consume state → payload          │
       │                 │ 7b. Token-Exchange (code → tokens)    │
       │                 │ 7c. verifyIdToken(signature)          │
       │                 │ 7d. Extract claims (tid, oid, email) │
       │                 │ 7e. validate tenant + domain +       │
       │                 │     enabled → reject on mismatch     │
       │                 │ 7f. Lookup user by email             │
       │                 │     → reject if not invited          │
       │                 │ 7g. Team-membership check            │
       │                 │     → reject if not member           │
       │                 │ 7h. Upsert user_sso_identities        │
       │                 │ 7i. auth.api.signInSocial with       │
       │                 │     pre-validated idToken            │
       │                 │     → session cookie is set          │
       │                 │ 7j. Audit log login.sso.entra         │
       │                 └──────────────────────────────────────┤
       │                                                        │
       │  8. 302 Redirect to /  (Set-Cookie: session_token)      │
       │◀───────────────────────────────────────────────────────┤
       │                                                        │
       ▼                                                        ▼
```

## Entra-App-Registrierung (einmalig, pro Umgebung)

Du brauchst eine App-Registrierung pro Umgebung (Dev, Prod). Die App
lebt in **deinem** Entra-Tenant und ist als Multi-Tenant konfiguriert,
damit Kunden aus beliebigen Entra-Tenants zugreifen können.

1. **Azure Portal** → **Microsoft Entra ID** → **App registrations** →
   **New registration**
2. **Name:** `lokri.io (Dev)` für die lokale Umgebung, `lokri.io` für
   Prod
3. **Supported account types:** „Accounts in any organizational
   directory (Any Microsoft Entra ID tenant - Multitenant)"
4. **Redirect URI** (Platform: **Web**):
   - Dev: `http://localhost:3000/api/auth/callback/microsoft`
   - Prod: `https://lokri.io/api/auth/callback/microsoft`
5. **Register** klicken
6. Auf der Overview-Seite die **Application (client) ID** kopieren →
   `ENTRA_CLIENT_ID`
7. **Certificates & secrets** → **Client secrets** → **New client
   secret**:
   - Description: „lokri.io auth" (o.ä.)
   - Expires: 24 Monate (Standard)
   - **Nach dem Anlegen:** Den **Value** (nicht die Secret ID!)
     kopieren → `ENTRA_CLIENT_SECRET`
   - Der Wert ist danach **nicht mehr abrufbar** — wenn verloren,
     neues Secret erstellen
8. **API permissions:** Default passt. `User.Read` (Microsoft Graph,
   delegated) ist vorausgewählt und reicht für die OIDC-Claims
   (`openid`, `profile`, `email`)

## Env-Variablen

In `.env.local` (Dev) und Vercel-Env-Vars (Production + Preview):

```bash
ENTRA_CLIENT_ID="a1b2c3d4-..."
ENTRA_CLIENT_SECRET="abcDEF..."
```

**Wenn beide leer sind:** Der Provider wird zur Laufzeit nicht
registriert, der App-Boot läuft unverändert und Teams ohne SSO-Config
loggen sich via Email/Passwort ein. In Production wird eine Warning
geloggt. Dev-Bootstraps ohne Entra sind stumm.

## Architektur-Notes

- **Provider-ID:** Better-Auth nennt den Provider intern `microsoft`
  (nicht `entra`), daher auch die Redirect-URI
  `/api/auth/callback/microsoft`. Die SSO-Config-Tabelle heisst aus
  Produkt-Gründen `team_sso_configs` mit `provider = "entra"` — das
  ist das User-Facing-Naming. Das Mapping ist 1:1 in der Callback-
  Route verdrahtet.
- **Tenant-Mode `common`:** lokri's Entra-App akzeptiert Tokens aus
  allen Tenants. Die Zugriffskontrolle passiert im Callback-Wrapper
  durch Validierung des `tid`-Claims gegen
  `team_sso_configs.tenant_id`.
- **Eigener Callback-Pfad:** Wir nutzen `/api/auth/sso/callback`, nicht
  Better-Auth's Standard `/api/auth/callback/microsoft`. Grund: wir
  brauchen den Team-Kontext (`ownerAccountId`) zur Tenant-Validation,
  für den Better-Auth's Standard-Flow keinen Slot vorsieht. Unser
  Callback ruft Better-Auth's Provider-Methoden (`validateAuthorizationCode`,
  `verifyIdToken`) direkt auf und fütterte den vor-validierten
  ID-Token in `auth.api.signInSocial({ idToken })`.
- **Scopes:** `openid`, `profile`, `email`. Keine Directory-Scopes
  (`User.Read.All` etc.) — lokri braucht nur Authentifizierung, keinen
  Graph-Zugriff.
- **Kein Token-Storage:** Entra-Access- und Refresh-Tokens werden nach
  Claim-Extraktion verworfen. Nur `user_sso_identities.subject`
  (Object-ID) wird persistiert.

## Was Phase 1 abgedeckt hat

- [x] **Block 1 — DB-Schema:** `team_sso_configs`, `user_sso_identities`,
      Migration `0018_sleepy_karnak.sql`
- [x] **Block 2 — Better-Auth-Integration:** Microsoft Social-Provider
      via `@better-auth/core/social-providers`, opt-in per
      `ENTRA_CLIENT_ID` + `ENTRA_CLIENT_SECRET`
- [x] **Block 3 — Validation + Callback + JIT:**
   - `GET /api/auth/sso-discovery?email=…` — email-domain-basiertes
     Matching gegen aktive Team-Configs
   - `GET /api/auth/sso/sign-in` — PKCE-State-Generation + Entra-
     Redirect, State liegt in der `verifications`-Tabelle (10 min TTL)
   - `GET /api/auth/sso/callback` — Token-Exchange, Claim-Validation,
     JIT-Linking, Session-Erstellung via `auth.api.signInSocial`
   - `lib/auth/sso-validation.ts` — DB-freie Validierungs-Funktionen
     (testbar via `tests/sso-validation.test.ts`, 24 Contract-Tests)
   - `lib/auth/sso.ts` — DB-Helpers (findSsoTeamForEmail,
     isUserTeamMember, hasFallbackAdmin, upsertSsoIdentity)
   - i18n-Error-Codes `errors.api.sso.*` (DE + EN)
- [x] **Block 4 — CLI + Doku:** `scripts/enable-sso-for-team.ts` als
      Dev-Shortcut, Phase-1-Doku abgeschlossen

## Was Phase 2 ergänzt

Phase 2 baut das **Admin-UI** zur SSO-Konfiguration, damit
Super-Admins Teams ohne CLI-Script auf SSO flippen können. Erfasst:

- `GET /api/admin/accounts/[id]/sso` — Config + Fallback-Admin-Status
- `PUT /api/admin/accounts/[id]/sso` — Upsert mit Fallback-Admin-Guard
- `POST /api/admin/accounts/[id]/sso/verify` — Entra-Discovery-Check
- `DELETE /api/admin/accounts/[id]/sso` — Config entfernen
- UI-Section auf `/admin/accounts/[id]` (nur für Team-Accounts)
- Erweiterte i18n-Codes für Config-Level-Errors

Der CLI-Shortcut `scripts/enable-sso-for-team.ts` bleibt nach Phase 2
im Repo — Dev-Only, für Scripted-Tests und Recovery-Szenarien.

## Was Phase 3 ergänzt

Phase 3 macht SSO zu einem echten **Self-Service-Feature** im
User-Scope:

- Team-Owner sehen unter `/team/security` eine eigene SSO-Section
- Team-Member sehen dort den aktuellen SSO-Status read-only
- Team-Owner können Tenant-ID, Allowed-Domains und Enable-Status selbst
  pflegen
- lokri zeigt einen **Admin-Consent-Link**, den der Team-Owner an den
  Entra-Admin seiner Organisation weiterleiten kann
- `/login` nutzt jetzt einen **Email-First-Flow**:
  - Email eingeben
  - lokri prüft per Discovery, ob das Team SSO aktiviert hat
  - bei SSO-Teams folgt der Redirect zu Microsoft
  - sonst erscheint der Passwort-Schritt wie gewohnt
- SSO-Fehlercodes aus dem Callback werden auf der Login-Seite
  lokalisiert gerendert
- Nach SSO-Aktivierung sehen bestehende Team-Member im Dashboard einen
  einmaligen Hinweis, dass ihr Team jetzt Microsoft-Login unterstützt

## End-User-Guide

### Für Team-Owner: SSO aktivieren

1. Öffne in deinem Team den Bereich `/team/security`
2. In der Section **Single Sign-On** trägst du eure Entra-`tenantId`
   und die erlaubten Email-Domains ein
3. Im Block **Setup in Azure Portal** findest du die Werte, die euer
   Entra-Admin für die App-Registrierung braucht:
   - Redirect-URI / Callback-URL
   - Supported account types
   - lokri Client-ID
4. Kopiere den **Admin-Consent-Link** und schicke ihn an euren
   Entra-Admin
5. Nach der Freigabe kehrst du zu `/team/security` zurück und klickst
   auf **Verifizieren**
6. Wenn der Test erfolgreich ist, kann SSO für dein Team aktiviert
   bleiben

### Für Entra-Admins: Admin-Consent

Der Consent-Link führt auf `login.microsoftonline.com/.../adminconsent`
und autorisiert die lokri-App einmalig für euren Tenant. Danach kann
lokri Benutzer aus eurem Tenant gegen die gespeicherte Team-Config
prüfen. Der Link selbst enthält keine Tokens oder Secrets.

### Für End-User: Login mit Email-First

1. Auf `/login` gibst du zuerst nur deine Email-Adresse ein
2. Gehört deine Email zu einem Team mit aktivem SSO, zeigt lokri kurz
   an, dass SSO für deine Organisation erkannt wurde
3. Danach wirst du zu Microsoft weitergeleitet
4. Wenn für deine Email kein Team-SSO aktiv ist, erscheint stattdessen
   der Passwort-Schritt

Typische Fehler wie `sso.domainNotAllowed`,
`sso.providerUnreachable` oder `sso.tokenVerificationFailed` werden auf
der Login-Seite lokalisiert angezeigt.

## Test-Checkliste (Phase 1)

Nach `pnpm install` + Env-Setup:

- [ ] `pnpm dev` startet ohne Fehler
- [ ] `curl http://localhost:3000/api/auth/get-session` → `200 OK` mit
      `null`-Body (keine Session)
- [ ] Ohne `ENTRA_CLIENT_ID` im Env startet die App trotzdem
- [ ] Test-Team mit Fallback-Admin angelegt
- [ ] `pnpm tsx --env-file=.env.local scripts/enable-sso-for-team.ts \
      <team-uuid> <tenant-uuid> <domain>` setzt Config
- [ ] `GET /api/auth/sso-discovery?email=user@<domain>` → `ssoEnabled: true`
- [ ] Browser-Flow gegen signInUrl redirectet zu Entra, Callback loggt
      User ein, Row in `user_sso_identities`, Audit-Event
      `login.sso.entra` mit `success: true`

## Troubleshooting

### `AADSTS50011: redirect URI mismatch`

Die Redirect-URI in der Entra-App stimmt nicht mit
`<BASE_URL>/api/auth/callback/microsoft` überein. Scheme + Port
beachten — Dev läuft auf `http://localhost:3000`, Prod auf
`https://lokri.io`.

### `sso.userNotInvited`

Die Email aus dem Entra-Token hat keinen passenden `users`-Row. lokri
provisioniert keine User automatisch — der Admin muss sie vorab via
`/admin/users` anlegen oder das Team muss ein Invite verschicken.

### `sso.notTeamMember`

User existiert, ist aber kein Mitglied des Teams, für das SSO
konfiguriert ist. In `owner_account_members` fehlt die Row für
(`user_id`, `owner_account_id`).

### `sso.tenantMismatch`

Der `tid`-Claim im ID-Token passt nicht zur `team_sso_configs.tenant_id`.
Typisch: User loggt sich mit einem persönlichen Microsoft-Account ein
statt mit dem Firmen-Account. Oder die Tenant-ID in der Team-Config ist
falsch. Der Fehler schützt gegen den Fall „gleiche Email-Domain in zwei
Tenants".

### `sso.domainNotAllowed`

Die Email-Domain aus dem ID-Token ist nicht in
`team_sso_configs.allowed_domains`. Admin-Check: Domain-Liste
vollständig? Subdomains werden bewusst nicht auto-gematcht.

### `sso.stateInvalid`

Der State-Parameter im Callback ist unbekannt oder abgelaufen
(10-Minuten-TTL). Typisch: User klickt den Setup-Link, wartet 15
Minuten, klickt dann den „Weiter"-Button — der State ist dann weg.
Einfach neu starten vom Login.

### `sso.providerUnreachable`

Entra hat den Token-Exchange abgelehnt oder die HTTP-Verbindung kam
nicht zustande. Prüfen: `ENTRA_CLIENT_SECRET` noch gültig?
Client-Secret im Azure-Portal ausgelaufen? Logs auf Server-Seite für
die spezifische Entra-Antwort.

### `Invalid Client Secret`

Secret-Wert vs. Secret-ID verwechselt, oder das Secret ist abgelaufen.
Azure-Portal → Certificates & Secrets prüfen, ggf. neu anlegen.

## Weiterführend

- `docs/sso-overview-plan.md` — strategischer Plan, Phasierung,
  Security-Constraints
- `lib/auth.ts` — `resolveMicrosoftSocialProvider()`,
  `microsoftSsoProvider` Export
- `lib/auth/sso.ts` + `lib/auth/sso-validation.ts` — Helpers
- `lib/db/schema.ts` — `teamSsoConfigs`, `userSsoIdentities`,
  `ssoProviderEnum`
- `app/api/auth/sso/callback/route.ts` — der Wrapper, der die
  Validation-Kette orchestriert
- [Better-Auth Social Providers](https://www.better-auth.com/docs/concepts/oauth#social-providers)
- [Microsoft Identity Platform — OIDC](https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc)
