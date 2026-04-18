# Operations

Admin-Playbook für Aufgaben, die kein UI haben. Kein Code in diesem Dokument
— nur SQL-Snippets und Runbook-Einträge.

Alles setzt Zugriff auf die Production-DB voraus (Neon). Queries nach
Möglichkeit in einem read-only-Branch laufen lassen, bevor sie auf
`main` gehen.

---

## Team-Features

### Einen Beta-User für Team-Erstellung freischalten

Team-Erstellung läuft derzeit nicht self-service — `users.can_create_teams`
muss manuell auf `true` gesetzt werden. Nach dem Flip sieht der User den
„Team erstellen"-Eintrag im Account-Switcher.

```sql
UPDATE users
SET can_create_teams = true
WHERE email = 'person@example.com';
```

Widerrufen analog mit `false`. Bestehende Teams des Users bleiben
unberührt — das Flag gatet nur das Erzeugen weiterer Teams.

### Team-Plan manuell abrechnen

Der `team`-Plan ist `is_purchasable: false` und hat (noch) keine
automatische Rechnungserstellung. Nach einer Einzel-Rechnung außerhalb
des Systems (Lexoffice o. ä.):

1. `orders`-Row manuell anlegen, `status = 'captured'`,
   `payment_id = '<manuelle-Ref>'`, `amount_cents` passend.
2. Optional: PDF hochladen und `invoices`-Row anlegen — das ist
   gleichwertig zu dem, was der PayPal-Capture-Flow schreibt.
3. `owner_accounts.plan_expires_at` auf das Ende des abrechenbaren
   Zeitraums setzen (z. B. `now() + interval '30 days'`).

Automatisches Billing via PayPal Subscriptions ist Roadmap-Punkt —
bis dahin ist das der Weg.

### Audit-Log Abfragen

Die Tabelle `audit_events` wird fire-and-forget von allen
security-relevanten Punkten gefüttert. Kein UI. Typische Abfragen:

Alle Events eines Accounts, neueste zuerst:

```sql
SELECT created_at, action, actor_user_id, target_type, target_id, metadata
FROM audit_events
WHERE owner_account_id = '<uuid>'
ORDER BY created_at DESC
LIMIT 100;
```

Role-Changes im Team:

```sql
SELECT created_at,
       actor_user_id,
       target_id AS affected_user_id,
       metadata->>'oldRole' AS old_role,
       metadata->>'newRole' AS new_role
FROM audit_events
WHERE action = 'member.role_changed'
  AND owner_account_id = '<team-uuid>'
ORDER BY created_at DESC;
```

Token-Widerrufe (manuell + automatisch durch Member-Remove):

```sql
SELECT created_at, action, actor_user_id, target_id, metadata
FROM audit_events
WHERE action IN ('token.revoked', 'token.revoked_on_member_remove')
  AND owner_account_id = '<account-uuid>'
ORDER BY created_at DESC;
```

Aktionen, die ein bestimmter User ausgelöst hat:

```sql
SELECT created_at, action, owner_account_id, target_type, target_id, metadata
FROM audit_events
WHERE actor_user_id = '<user-id>'
ORDER BY created_at DESC
LIMIT 200;
```

### Hängende Einladungen zurückziehen

Wenn eine Einladung verschickt wurde und nicht mehr gebraucht wird, aber
der Admin sie nicht über das UI revokt:

```sql
UPDATE team_invites
SET revoked_at = now()
WHERE id = '<invite-uuid>'
  AND accepted_at IS NULL
  AND revoked_at IS NULL;
```

Alle abgelaufenen, nicht-akzeptierten Einladungen eines Teams listen:

```sql
SELECT id, email, role, expires_at
FROM team_invites
WHERE owner_account_id = '<team-uuid>'
  AND accepted_at IS NULL
  AND revoked_at IS NULL
  AND expires_at < now();
```

### Verwaiste Team-Tokens prüfen

Team-Tokens (`scope_type = 'team'`) überleben Member-Wechsel. Falls ein
Team-Token nicht mehr genutzt wird und niemand sich an ihn erinnert:

```sql
SELECT id, name, last_used_at, created_at
FROM api_tokens
WHERE owner_account_id = '<team-uuid>'
  AND scope_type = 'team'
  AND revoked_at IS NULL
ORDER BY last_used_at NULLS FIRST;
```

### Member-Count vs. Seat-Quota prüfen

Für seat-basierte Pläne entspricht das effektive Limit
`plan.max_bytes × seatCount`. Schneller Sanity-Check:

```sql
SELECT oa.id,
       oa.name,
       (SELECT count(*) FROM owner_account_members m
         WHERE m.owner_account_id = oa.id) AS seats,
       p.max_bytes AS bytes_per_seat,
       (SELECT used_bytes FROM usage_quota q
         WHERE q.owner_account_id = oa.id) AS used_bytes
FROM owner_accounts oa
JOIN plans p ON p.id = oa.plan_id
WHERE p.is_seat_based = true
ORDER BY oa.name;
```

---

## Mail-Versand (Resend)

Mail-Versand geht über Resend. Lokal ohne `RESEND_API_KEY` wird der
Inhalt in den Server-Log geschrieben — handy zum Debuggen. Im
Production-Deploy **muss** der Key gesetzt sein; sonst schlucken wir
Verification-Links still.

Absender wird aus `MAIL_FROM` gelesen, Fallback
`lokri.io <onboarding@resend.dev>`. Für echte Absender muss die Domain
in Resend verifiziert sein (SPF/DKIM).

Empfänger-Sprache wird aus `users.preferred_locale` gelesen
(`localeForUserEmail`), bei Nicht-Existenz fällt es auf Deutsch zurück.

---

## Datenbank-Migrationen

Alle Migrationen liegen in `drizzle/` und sind nummeriert. Lokal + CI:

```bash
pnpm db:migrate
```

Auf Production-Neon laufen sie **nicht automatisch beim Vercel-Deploy**.
Nach einem Deploy, der eine neue Migration enthält:

```bash
DATABASE_URL=<production-url> pnpm db:migrate
```

Oder falls `.env.local` bereits auf Production zeigt, einfach
`pnpm db:migrate`.
