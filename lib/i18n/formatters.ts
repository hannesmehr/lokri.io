import type { Locale } from "./config";

/**
 * Locale-aware formatters — one central place so every page/component gets
 * the same formatting for dates, numbers, bytes, currency. Built on
 * `Intl.*` — no extra dependency. Consumers on the server pass `locale`
 * explicitly; on the client, grab it via `useLocale()` from `next-intl`.
 *
 * All functions accept strings as well as Date objects so API responses
 * (which come back as ISO strings) don't need manual `new Date(...)`
 * wrapping at the call site.
 */

const LOCALE_TAG: Record<Locale, string> = {
  de: "de-DE",
  en: "en-US",
};

function toDate(input: Date | string): Date {
  return input instanceof Date ? input : new Date(input);
}

/** Compact, "14.04.2026" / "Apr 14, 2026". Good for tables + lists. */
export function formatDate(
  input: Date | string,
  locale: Locale,
  style: "short" | "medium" | "long" = "medium",
): string {
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], { dateStyle: style }).format(
    toDate(input),
  );
}

/** Full date + time, e.g. "14.04.2026, 17:23" / "Apr 14, 2026, 5:23 PM". */
export function formatDateTime(input: Date | string, locale: Locale): string {
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(toDate(input));
}

/** "vor 3 Minuten" / "3 minutes ago" — via `Intl.RelativeTimeFormat`. */
export function formatRelative(input: Date | string, locale: Locale): string {
  const rtf = new Intl.RelativeTimeFormat(LOCALE_TAG[locale], {
    numeric: "auto",
  });
  const diffMs = toDate(input).getTime() - Date.now();
  const absSec = Math.abs(diffMs) / 1000;
  const sign = Math.sign(diffMs);

  if (absSec < 60) return rtf.format(Math.round(diffMs / 1000), "second");
  if (absSec < 3600) return rtf.format(Math.round(diffMs / 60_000), "minute");
  if (absSec < 86_400) return rtf.format(Math.round(diffMs / 3_600_000), "hour");
  if (absSec < 2_592_000)
    return rtf.format(Math.round(diffMs / 86_400_000), "day");
  if (absSec < 31_536_000)
    return rtf.format(Math.round(diffMs / 2_592_000_000), "month");
  return rtf.format(sign * Math.round(absSec / 31_536_000), "year");
}

/** Plain number — "1.234,56" / "1,234.56". */
export function formatNumber(n: number, locale: Locale): string {
  return new Intl.NumberFormat(LOCALE_TAG[locale]).format(n);
}

/**
 * Byte-count in human form — "12,3 MB" / "12.3 MB". 1024-based (mebi)
 * so "1 MB" means 1024·1024 bytes, matching what the storage layer
 * actually stores.
 */
export function formatBytes(bytes: number, locale: Locale): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exp = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / Math.pow(1024, exp);
  const formatted = new Intl.NumberFormat(LOCALE_TAG[locale], {
    maximumFractionDigits: value >= 10 || exp === 0 ? 0 : 1,
  }).format(value);
  return `${formatted} ${units[exp]}`;
}

/**
 * Format a cents integer as a currency string — `490` (EUR cents) →
 * "4,90 €" / "€4.90".
 */
export function formatCurrency(
  cents: number,
  locale: Locale,
  currency = "EUR",
): string {
  return new Intl.NumberFormat(LOCALE_TAG[locale], {
    style: "currency",
    currency,
  }).format(cents / 100);
}
