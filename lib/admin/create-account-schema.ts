import { z } from "zod";

/**
 * Zod-Schema für `POST /api/admin/accounts` (Admin-Team-Account-Create).
 *
 * Lebt in einer eigenen, DB-freien Datei, damit `tests/admin-account-
 * create.test.ts` die Validation pinnen kann, ohne den DB-Client zu
 * initialisieren (analog zu `lib/admin/create-user-schema.ts`).
 *
 * **Plan-IDs** sind hier hart codiert und müssen synchron bleiben mit
 * `lib/db/seed.ts`. Es gibt keine zentrale `lib/billing/plans.ts`
 * als Single-Source-of-Truth — bei Plan-Änderungen (neue Tiers, Rename)
 * beide Stellen anpassen. Wenn jemals mehr als 5 Plans existieren oder
 * Plans dynamisch werden, sollte hier eine `ALL_PLAN_IDS`-Konstante
 * aus einem neuen Modul importiert werden.
 */

/**
 * Whitelist der bekannten Plan-IDs. Identisch mit `lib/db/seed.ts`.
 * Admin darf jeden dieser Plans für einen Team-Account wählen —
 * auch `free` und Nicht-Team-Plans, weil Ops-Szenarien (Test-Konten,
 * Legacy-Migration) das brauchen können.
 */
export const KNOWN_PLAN_IDS = [
  "free",
  "starter",
  "pro",
  "business",
  "team",
] as const;

export type KnownPlanId = (typeof KNOWN_PLAN_IDS)[number];

/**
 * Quota-Override-Shape. Alle Felder optional; `null` oder fehlend
 * bedeutet „Plan-Default nutzen". Shape entspricht dem `quotaOverride`
 * jsonb-Feld in `owner_accounts` (siehe `lib/db/schema.ts`).
 *
 * `bytes`/`files`/`notes` sind non-negative Ganzzahlen. Semantik:
 *   - Wert gesetzt   ⇒ Plan-Limit wird ersetzt (auch nach Seat-
 *     Multiplikation bei Team-Plan)
 *   - Wert null/weg  ⇒ Plan-Limit greift
 *
 * Bewusst kein `seats`-Override hier — Seat-Count lebt auf
 * `owner_account_members`-Ebene (Anzahl der Rows); wer Seat-Count
 * überschreiben will, fügt Member hinzu oder entfernt sie.
 */
export const quotaOverrideSchema = z
  .object({
    bytes: z.number().int().min(0).nullable().optional(),
    files: z.number().int().min(0).nullable().optional(),
    notes: z.number().int().min(0).nullable().optional(),
  })
  .strict()
  .optional();

export const createAccountSchema = z.object({
  name: z.string().trim().min(1).max(120),
  /** Whitelist — jede ID aus `seed.ts`. */
  planId: z.enum(KNOWN_PLAN_IDS),
  /**
   * Optional zugewiesener Owner. Wenn gesetzt: bestehender User wird
   * als `owner` in `owner_account_members` eingetragen. Wenn weg:
   * Team bleibt „orphaned" — nützlich für Staging- / Test-Accounts,
   * bei denen der Owner später manuell zugewiesen wird.
   *
   * UUID, weil `users.id` zwar `text` ist, aber bei uns durchweg
   * UUID-Strings hält (Better-Auth + unsere `crypto.randomUUID()`-
   * Pfade). Falls ein Nicht-UUID-User-ID existiert, schlägt die
   * Validation fehl — bisher nicht passiert.
   */
  ownerUserId: z.string().uuid().optional(),
  quotaOverride: quotaOverrideSchema,
});

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
