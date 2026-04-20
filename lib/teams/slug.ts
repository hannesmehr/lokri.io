/**
 * Slug-Generierung für `owner_accounts`.
 *
 * Slug ist die URL-sichere, global-eindeutige Handle für einen
 * Owner-Account (Personal oder Team). Wird primär vom team-scoped
 * MCP-Endpoint `/api/mcp/team/[slug]` verwendet, ist aber bewusst auch
 * für Personal-Accounts belegt — spätere User-Facing-Routen sollen
 * ohne weitere Migration bedient werden können.
 *
 * Slug-Regeln:
 *   - NFKD-Normalisierung + Entfernen von Diacritics ("Müller" → "muller")
 *   - Lowercase
 *   - Nicht-alphanumerische Zeichen → "-"
 *   - Mehrfach-Hyphens → einzelner Hyphen
 *   - Leading/trailing Hyphens abgeschnitten
 *   - Länge: 2–60 Zeichen (nach Normalisierung; kurze Namen bekommen Suffix)
 *   - Reservierte Slugs (siehe `RESERVED_SLUGS`) werden mit `-team` suffigiert
 *     bevor Kollisions-Resolution einsetzt, damit `/api/mcp/team/api` &
 *     friends nie ambivalent sind
 *
 * Kollisionen werden durch einen numerischen Suffix aufgelöst:
 * `base` → `base-2` → `base-3` … Die Kollisions-Prüfung liegt beim
 * Caller (`ensureUniqueSlug`), damit Transaktions-Kontext und DB-Client
 * sauber durchgereicht werden.
 */

/**
 * Slugs die ein anderes Produkt-Feature bedienen und daher nicht an
 * User-Accounts vergeben werden dürfen. Wenn ein User einen Team-Namen
 * eintippt, dessen Slug hier landet, kriegt er stattdessen
 * `<base>-team` (oder mit Kollisions-Suffix).
 *
 * Neue reservierte Paths (z. B. wenn `/api/mcp/team/health` o. ä. jemals
 * ein echter Endpoint würde) einfach hier eintragen — ist billiger als
 * eine Migration später.
 */
export const RESERVED_SLUGS = new Set<string>([
  "admin",
  "api",
  "app",
  "auth",
  "billing",
  "connect",
  "dashboard",
  "health",
  "help",
  "login",
  "logout",
  "mcp",
  "new",
  "oauth",
  "public",
  "settings",
  "signup",
  "static",
  "status",
  "support",
  "well-known",
  // NB: "team", "teams", "user", "users" are **not** reserved — they're
  // used as fallback prefixes when a user's account-name slugifies to
  // something too short. A user who picks "Team" as their literal team
  // name gets slug=team and that's fine; it sits under `/api/mcp/team/team`
  // which routes via the dynamic segment without conflict.
]);

const MIN_SLUG_LENGTH = 2;
const MAX_SLUG_LENGTH = 60;

/**
 * Erzeugt den **Basis-Slug** aus einem Account-Namen. Kein Uniqueness-Check —
 * das macht `ensureUniqueSlug` mit DB-Zugriff.
 *
 * Die Output-Länge ist auf `MAX_SLUG_LENGTH` beschränkt; längere Namen
 * werden am letzten Hyphen vor der Grenze abgeschnitten, damit wir
 * nicht mitten in einem Wort kappen.
 *
 * Falls der Name nach Normalisierung leer oder zu kurz ist (z. B. nur
 * Sonderzeichen oder ein einzelner Buchstabe), wird er mit
 * `fallbackPrefix` (default: "account") aufgefüllt. Caller die einen
 * Fallback brauchen (z. B. Team-Create mit reinem Emoji-Namen), können
 * einen eigenen Prefix mitgeben ("team").
 */
export function slugifyOwnerAccountName(
  name: string,
  fallbackPrefix = "account",
): string {
  const normalized = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // Combining diacritics weg
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  let slug = normalized.length >= MIN_SLUG_LENGTH ? normalized : fallbackPrefix;

  if (slug.length > MAX_SLUG_LENGTH) {
    const truncated = slug.slice(0, MAX_SLUG_LENGTH);
    const lastHyphen = truncated.lastIndexOf("-");
    // Nur am Hyphen schneiden, wenn das nicht den ganzen Slug zu kurz macht
    slug =
      lastHyphen >= MIN_SLUG_LENGTH ? truncated.slice(0, lastHyphen) : truncated;
  }

  if (RESERVED_SLUGS.has(slug)) {
    slug = `${slug}-team`;
  }

  return slug;
}

/**
 * Löst Slug-Kollisionen auf. Ruft `isTaken(candidate)` für den Basis-Slug
 * und — bei Kollision — für `base-2`, `base-3`, … bis `maxAttempts`.
 *
 * Wirft, wenn nach `maxAttempts` noch kein freier Slug gefunden ist. Das
 * ist extrem unwahrscheinlich (bräuchte hunderte existierende Accounts
 * mit identischer `slugifyOwnerAccountName`-Ausgabe), aber wir wollen
 * die Ausnahme sichtbar — stilles Fallback auf UUID würde uns in der
 * UI mit „u-7a3b1c2d"-URLs belästigen.
 *
 * Der Caller gibt den DB-Lookup-Callback mit — so bleibt die Funktion
 * pur und in einer Transaktion verwendbar (Lookup läuft im selben `tx`).
 */
export async function ensureUniqueSlug(
  base: string,
  isTaken: (candidate: string) => Promise<boolean>,
  maxAttempts = 200,
): Promise<string> {
  if (!(await isTaken(base))) return base;

  for (let i = 2; i <= maxAttempts; i++) {
    // Suffix berücksichtigen beim Trimmen, damit `base-99` nicht über
    // MAX_SLUG_LENGTH läuft.
    const suffix = `-${i}`;
    const room = MAX_SLUG_LENGTH - suffix.length;
    const prefix = base.length > room ? base.slice(0, room) : base;
    const candidate = `${prefix}${suffix}`;
    if (!(await isTaken(candidate))) return candidate;
  }

  throw new Error(
    `ensureUniqueSlug: no free slug for base="${base}" after ${maxAttempts} attempts`,
  );
}
