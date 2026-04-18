/**
 * Central i18n constants. Kept tiny + dependency-free so both server
 * (`lib/i18n/request.ts`, `lib/i18n/locale.ts`) and client (profile
 * switcher) can import from it without pulling `next-intl` into every
 * entry point.
 *
 * URL-Strategie: **keine Prefixes**. Die aktive Locale wird ausschließlich
 * serverseitig aufgelöst (User-DB → Cookie → Accept-Language → default).
 * Entsprechend läuft `next-intl` nicht als Routing-Middleware, sondern nur
 * über `getRequestConfig` + `NextIntlClientProvider` im Root-Layout.
 */

export const locales = ["de", "en"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "de";

/** Cookie-Name für die User-Sprachwahl. Muss mit dem Client-Switcher
 *  übereinstimmen — Client liest/setzt das Cookie via `document.cookie`
 *  und/oder ruft `PATCH /api/profile/locale` auf, das setzt es server-seitig. */
export const localeCookieName = "lokri-locale";

/** 1 Jahr — lang genug, dass Stamm-User die Wahl nur einmal treffen. */
export const localeCookieMaxAge = 60 * 60 * 24 * 365;

export function isLocale(value: string | null | undefined): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}
