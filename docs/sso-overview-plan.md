# SSO für Teams — Strategischer Plan

**Stand:** Phase 1 in Umsetzung. Dieses Dokument fixiert die
Grundsatz-Entscheidungen, damit sie über Phasen-Grenzen hinweg nicht
neu verhandelt werden.

**Ziel:** Microsoft Entra ID SSO für Team-Accounts in lokri.io. KMU
mit M365-Umgebung können ihre Team-Member via Entra ID
authentifizieren statt über lokale Passwörter.

**Warum Entra zuerst und nicht Google Workspace:** Entra-Multi-Tenant-
App läuft ohne Publisher Verification, Google Workspace braucht
App-Verification-Prozess. Entra = schnellerer Time-to-Market. Google
Workspace kommt in einer späteren Runde, wenn erste Entra-Kunden live
sind.

**Nicht in Scope (jetzt):**

- Google Workspace SSO (später)
- SAML (erst bei Enterprise-Kundenwunsch, nicht proaktiv)
- SCIM User-Provisioning (später)
- Personal-Accounts SSO (Email/Passwort bleibt, auch wenn der User
  später in ein Team mit SSO eintritt)

## Grundsatz-Entscheidungen

### 1. SSO ist eine Team-Eigenschaft, nicht eine User-Eigenschaft

Ein User kann simultan:

- Mit Email/Passwort in seinen Personal-Account einloggen
- Mit Entra SSO in Team-Account "Firma X" (Login via Microsoft)
- Mit Email/Passwort in Team-Account "Firma Y" (falls dort SSO nicht
  konfiguriert ist)

Das heisst: Die Auth-Methode wird beim Login **pro Account** verhandelt,
nicht pro User-Session-Start.

### 2. Kein Auto-Provisioning

User in Entra existiert ≠ User bekommt automatisch Zugriff auf
Team-Account. Ein Admin muss den User erstmal via Invite-Flow oder
manuell hinzufügen. SSO stellt nur sicher: „Wer sich einloggt, ist
wirklich wer er vorgibt zu sein." Zugriffskontrolle bleibt in lokri.io.

Begründung: Auto-Provisioning klingt attraktiv, aber ohne SCIM ist es
fehleranfällig (Deprovisioning, Rollenänderungen). Wir machen es später
richtig oder gar nicht.

### 3. JIT-Account-Linking beim ersten SSO-Login

Wenn ein via Admin/Invite hinzugefügter User sich zum ersten Mal per
SSO einloggt:

- Email aus dem SSO-Token matching mit dem bereits angelegten
  User-Record
- Beim erfolgreichen Match: `user_sso_identities`-Eintrag wird angelegt
- Nachfolgende Logins nutzen direkt die SSO-Identity

Wenn beim ersten Login kein passender lokri-User gefunden wird:
**Ablehnung** mit klarer Fehlermeldung „Deine Organisation hat dich
noch nicht eingeladen". Kein Auto-Create.

### 4. Fallback-Admin pro SSO-Team

Jedes Team mit SSO muss **mindestens einen Owner oder Admin mit
funktionierendem Email-Passwort-Login** behalten. Verhindert Lockout,
wenn die Entra-Integration Probleme hat (Consent widerrufen,
Tenant-Migration, etc.).

Entsprechende Check-Logik in UI + Backend.

## Phasierung

### Phase 1 ✅: Fundament (Backend + Datenmodell + Auth-Flow)

**Ziel:** SSO funktioniert technisch für einen Test-Team, per CLI oder
direktem DB-Eintrag konfiguriert. Keine UI.

- **Block 1 ✅:** DB-Schema (`team_sso_configs`, `user_sso_identities`) +
  Migration `0018_sleepy_karnak.sql`
- **Block 2 ✅:** Better-Auth-Integration mit Entra ID als Social Provider
- **Block 3 ✅:** SSO-Discovery-Endpoint, Callback-Wrapper mit Team-
  Account-Verhandlung, JIT-Linking, Fallback-Admin-Check, Dev-CLI,
  24 Contract-Tests
- **Block 4 ✅:** Doku + Cleanup + Push

### Phase 2 🔄: Admin-UI zur Team-SSO-Konfiguration

**In Arbeit.** Im Super-Admin-Bereich (`/admin/accounts/[id]`) bekommt
jeder Team-Account eine Section „Team-SSO". Erfasst:

- `GET /api/admin/accounts/[id]/sso` — Config + Fallback-Admin-Status
- `PUT /api/admin/accounts/[id]/sso` — Upsert mit Fallback-Admin-Guard
- `POST /api/admin/accounts/[id]/sso/verify` — Entra-Discovery-Test
- `DELETE /api/admin/accounts/[id]/sso` — Config entfernen
- UI-Formular mit Tenant-ID, Allowed-Domains (Multi-Tag-Input),
  Enable-Toggle, Verbindungs-Test-Button, Status-Footer

Der Dev-CLI-Shortcut `scripts/enable-sso-for-team.ts` bleibt für
Scripted-Tests und Recovery-Szenarien im Repo.

### Phase 3: Team-Owner-Self-Service + UX-Polish

Team-Owner können in ihrem Team-Settings-Bereich SSO aktivieren/
konfigurieren. Login-Page UX verfeinert, Error-States durchgearbeitet.

### Phase 4 (optional): Google Workspace SSO

Analog zu Entra, aber mit Google als OIDC-Provider. Kommt, wenn der
erste Entra-Kunde live ist.

## Technische Vorab-Klärungen

### Better-Auth-SSO-Plugin oder Custom-Integration?

Better-Auth hat OIDC-Provider-Support. Entra ID ist OIDC-kompatibel.
Standard-Plugin (`microsoft` Social Provider) nutzen, wo möglich.
Custom nur für Team-Account-Verhandlung und JIT-Linking.

### Entra-App-Setup

Multi-Tenant (`common`) als einzige App in lokri's Entra-Tenant. Jeder
Kunde gibt beim Onboarding nur seine Tenant-ID an — lokri verifiziert
dann, dass eingehende Tokens von dieser Tenant-ID kommen. Keine
separate App pro Kunde nötig.

### Consent-Flow

Entra-Admin des Kunden muss einmalig die lokri-App in seinem Tenant
autorisieren (Admin-Consent für die benötigten Scopes). Passiert beim
ersten SSO-Setup via Link, den lokri bereitstellt.

### Scopes

Minimal: `openid`, `profile`, `email`. Keine Directory-Scopes — nur
was für Authentifizierung nötig ist. Least-privilege.

### Token-Handling

Kein Upstream-Token-Storage initially. Entra-Tokens nur für den
Login-Moment (Email-Claim extrahieren), danach lokri-interne Session.
Refresh-Tokens werden nicht gespeichert.

### Session-Cookies

Unverändert. Better-Auth-Session, wie bei Email-Login. SSO ist nur ein
zusätzlicher Weg, eine Session zu erzeugen.

## Security-Constraints (gelten für alle Phasen)

- Entra-Token werden nach Claim-Extraktion sofort verworfen, nicht
  persistiert
- `user_sso_identities` speichert nur: `provider`, `subject`,
  `tenant_id`, `linked_at` — keine Tokens
- Tenant-ID-Whitelist pro Team ist verpflichtend (verhindert „falscher
  Entra-Tenant mit derselben Email"-Attack)
- Login-Audit-Event `login.sso.entra` mit `{ userId, teamId, tenantId,
  success, failureReason }`
- Admin-Consent-Link wird nur Super-Admins (Phase 2) bzw. Team-Owners
  (Phase 3) angezeigt
- Error-Messages generisch bei User-Existenz-Check (keine
  Enumeration-Attacks)
