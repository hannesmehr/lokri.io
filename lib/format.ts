/**
 * Shared UI formatting helpers — kept out of components so tests can hit them
 * without React.
 */

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function pct(used: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(100, Math.round((used / max) * 100));
}

const DATE_FMT = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatDateTime(d: Date | string | number): string {
  return DATE_FMT.format(new Date(d));
}

const RELATIVE_FMT = new Intl.RelativeTimeFormat("de-DE", { numeric: "auto" });

export function formatRelative(d: Date | string | number): string {
  const date = new Date(d);
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  const week = 7 * day;
  if (abs < min) return "gerade eben";
  if (abs < hour) return RELATIVE_FMT.format(Math.round(diff / min), "minute");
  if (abs < day) return RELATIVE_FMT.format(Math.round(diff / hour), "hour");
  if (abs < week) return RELATIVE_FMT.format(Math.round(diff / day), "day");
  return formatDateTime(date);
}
