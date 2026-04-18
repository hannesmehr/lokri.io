/**
 * Shared Formatter-Helpers für das Admin-Dashboard. Deutsch-lokalisierte
 * Zahl/Währung/Datums-Ausgabe, kompakte Byte-Darstellung.
 */

export function formatEuro(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
}

export function formatEuroCents(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatNumber(n: number): string {
  return n.toLocaleString("de-DE");
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exp = Math.min(
    Math.floor(Math.log(n) / Math.log(1024)),
    units.length - 1,
  );
  const value = n / Math.pow(1024, exp);
  return `${value.toLocaleString("de-DE", {
    maximumFractionDigits: value >= 10 || exp === 0 ? 0 : 1,
  })} ${units[exp]}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE");
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelative(iso: string): string {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return "—";
  const diff = Date.now() - ts;
  const abs = Math.abs(diff);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const future = diff < 0;
  const prefix = future ? "in " : "vor ";
  if (abs < minute) return future ? "gleich" : "gerade eben";
  if (abs < hour) return `${prefix}${Math.round(abs / minute)} Min`;
  if (abs < day) return `${prefix}${Math.round(abs / hour)} Std`;
  const days = Math.round(abs / day);
  if (days < 30) return `${prefix}${days} Tag${days === 1 ? "" : "en"}`;
  return new Date(iso).toLocaleDateString("de-DE");
}

/** Kompakte Kurz-Form einer kurzen ISO-Tagesangabe (YYYY-MM-DD → TT.MM.). */
export function formatShortDay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.`;
}

/** Monats-Kurzform YYYY-MM → Mmm 'JJ (z.B. "2026-04" → "Apr 26"). */
export function formatShortMonth(iso: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  return d.toLocaleDateString("de-DE", { month: "short", year: "2-digit" });
}
