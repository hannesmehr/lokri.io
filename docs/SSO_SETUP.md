# SSO-Setup — Microsoft Entra ID

**Stand:** Phase 1, Block 2 (Better-Auth-Integration) — Fundament ist
gelegt, die Team-Account-Verhandlung und JIT-Linking folgen in Block 3.
Diese Doku wird pro Phase erweitert.

## Überblick

lokri.io unterstützt SSO für **Team-Accounts** über Microsoft Entra ID
(OIDC). Der Flow:

```
User tippt Email auf /login
  └─ Discovery (Block 3): "Gehört die Domain zu einem SSO-Team?"
       └─ Ja → Redirect zu Entra-Login
             └─ Callback mit ID-Token
                   └─ Tenant-ID validieren (tid-Claim gegen team_sso_configs)
                   └─ User-Lookup per Email
                   └─ JIT-Link oder last_login aktualisieren
                   └─ Better-Auth-Session setzen
       └─ Nein → normaler Email/Passwort-Flow
```

Personal-Accounts bleiben auf Email/Passwort. SSO ist strikt
Team-Eigenschaft, kein User-Flag.

## Entra-App-Registrierung (einmalig, pro Umgebung)

Du brauchst eine App-Registrierung pro Umgebung (Dev, Prod). Die App
lebt in **deinem** Entra-Tenant und ist als Multi-Tenant konfiguriert,
damit Kunden aus beliebigen Entra-Tenants zugreifen können.

1. **Azure Portal** → **Microsoft Entra ID** → **App registrations** →
   **New registration**
2. **Name:** `lokri.io (Dev)` für die lokale Umgebung, `lokri.io` für
   Prod
3. **Supported account types:** "Accounts in any organizational
   directory (Any Microsoft Entra ID tenant - Multitenant)"
4. **Redirect URI** (Platform: **Web**):
   - Dev: `http://localhost:3000/api/auth/callback/microsoft`
   - Prod: `https://lokri.io/api/auth/callback/microsoft`
5. **Register** klicken
6. Auf der Overview-Seite die **Application (client) ID** kopieren →
   `ENTRA_CLIENT_ID`
7. **Certificates & secrets** → **Client secrets** → **New client
   secret**:
   - Description: "lokri.io auth" (o.ä.)
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
geloggt, damit man nicht versehentlich ohne SSO deployed. Dev-Bootstraps
ohne Entra sind stumm.

## Architektur-Notes

- **Provider-ID:** Better-Auth nennt den Provider intern `microsoft`
  (nicht `entra`), daher auch die Redirect-URI
  `/api/auth/callback/microsoft`. Die SSO-Config-Tabelle heisst aus
  Produkt-Gründen `team_sso_configs` mit `provider = "entra"` — das
  ist das User-Facing-Naming. Das Mapping ist 1:1 in Block 3 verdrahtet.
- **Tenant-Mode `common`:** lokri's Entra-App akzeptiert Tokens aus
  allen Tenants. Die Zugriffskontrolle passiert dann in unserem
  Callback-Wrapper durch Validierung des `tid`-Claims gegen
  `team_sso_configs.tenant_id` — siehe Block 3.
- **Scopes:** `openid`, `profile`, `email`. Keine Directory-Scopes
  (`User.Read.All` etc.) — lokri braucht nur Authentifizierung, keinen
  Graph-Zugriff.
- **Kein Token-Storage:** Entra-Access- und Refresh-Tokens werden nach
  Claim-Extraktion verworfen. Nur `user_sso_identities.subject`
  (Object-ID) wird persistiert.

## Was in Phase 1 Block 2 drin ist

- [x] DB-Schema (`team_sso_configs`, `user_sso_identities`) — Block 1
- [x] Entra-Provider in Better-Auth-Config — opt-in per Env
- [x] `.env.example`-Dokumentation
- [ ] Discovery-Endpoint `GET /api/auth/sso-discovery` — Block 3
- [ ] Callback-Wrapper mit Team-Context + Tenant-Validation — Block 3
- [ ] JIT-Account-Linking — Block 3
- [ ] Fallback-Admin-Check-Helper — Block 3
- [ ] CLI-Script zum Aktivieren eines Test-Teams — Block 3
- [ ] End-to-End-Test mit echtem Entra-Tenant — Block 3

## Test-Checkliste (Block 2)

Nach `pnpm install` + Env-Setup:

- [ ] `pnpm dev` startet ohne Fehler
- [ ] `curl http://localhost:3000/api/auth/get-session` → `200 OK` mit
      `null`-Body (keine Session)
- [ ] Ohne `ENTRA_CLIENT_ID` im Env startet die App trotzdem und der
      Microsoft-Provider ist nicht im `auth.api`-Pfad
- [ ] Mit gesetzten Env-Vars existiert `/api/auth/sign-in/social`
      (Better-Auth-Standard-Route) und akzeptiert `provider:
      "microsoft"` — aber Block-3-Team-Discovery ist nötig, bevor ein
      User-Flow durchläuft

## Troubleshooting

**`AADSTS50011: The redirect URI specified in the request does not
match…`** — Die Redirect-URI in der Entra-App-Registrierung stimmt
nicht exakt mit `<BASE_URL>/api/auth/callback/microsoft` überein.
Scheme + Port beachten.

**Invalid Client Secret** — Secret-Wert vs. Secret-ID verwechselt,
oder das Secret ist abgelaufen. Azure-Portal → Certificates & Secrets
prüfen, ggf. neu anlegen.

**Tokens akzeptiert aber User nicht eingeloggt** — in Phase 1 Block 2
normal: Team-Discovery + JIT-Linking fehlen noch. Wird in Block 3
verdrahtet.

## Weiterführend

- `docs/sso-overview-plan.md` — strategischer Plan, Phasierung
- `lib/auth.ts` — `resolveMicrosoftSocialProvider()`
- `lib/db/schema.ts` — `teamSsoConfigs`, `userSsoIdentities`
- [Better-Auth Social Providers](https://www.better-auth.com/docs/concepts/oauth#social-providers)
- [Microsoft Identity Platform - OIDC](https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc)
