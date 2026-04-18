/**
 * In-Process-Cache für Admin-Stats-Queries.
 *
 * Motivation: KPI-Queries gehen durch (ausgehend) mehrere COUNT / SUM /
 * GROUP-BY-Statements, die mit wachsender Datenbasis teurer werden.
 * Der Admin-Dashboard-Refresh-Rhythmus ist aber niedrig (ein paar Mal
 * pro Stunde) und absolute Live-Zahlen sind nicht nötig — also caten
 * wir die Ergebnisse für ein paar Sekunden/Minuten.
 *
 * Bewusst simpel: `Map<string, {value, expiresAt}>` — keine Redis-
 * Abhängigkeit, kein LRU-Eviction. Wenn wir auf Vercel mehrere
 * Lambda-Instanzen haben, ist jede ihre eigene Cache-Einheit; das ist
 * für unsere Volumes okay und vermeidet Round-Trip-Kosten.
 *
 * Invalidate wird vom Dashboard-Refresh-Button aufgerufen (siehe
 * `/api/admin/stats/invalidate-cache`). Per-Prefix-Invalidation erlaubt
 * gezielten Refresh (z.B. nur `kpi.*`-Einträge).
 */

interface Entry<T> {
  value: T;
  expiresAt: number;
}

const cache = new Map<string, Entry<unknown>>();

/**
 * Liefert den Cached-Wert für `key` falls vorhanden + nicht abgelaufen,
 * sonst ruft `loader()` auf, speichert das Ergebnis mit TTL und gibt es
 * zurück. Concurrent-Loads für den gleichen Key laufen parallel — das
 * ist okay, weil die Loader idempotent sind (reine SELECTs).
 */
export async function getCachedStats<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const existing = cache.get(key) as Entry<T> | undefined;
  if (existing && existing.expiresAt > now) {
    return existing.value;
  }
  const value = await loader();
  cache.set(key, { value, expiresAt: now + ttlSeconds * 1000 });
  return value;
}

/**
 * Löscht gezielt Cache-Einträge. Ohne Argument: alles. Mit Prefix-String:
 * nur Keys, die damit beginnen.
 */
export function invalidateStatsCache(keyPrefix?: string): number {
  if (!keyPrefix) {
    const n = cache.size;
    cache.clear();
    return n;
  }
  let n = 0;
  for (const k of cache.keys()) {
    if (k.startsWith(keyPrefix)) {
      cache.delete(k);
      n++;
    }
  }
  return n;
}

/** Nur für Tests & Debug. */
export function _debugCacheSnapshot(): Array<{ key: string; expiresIn: number }> {
  const now = Date.now();
  return [...cache.entries()].map(([key, e]) => ({
    key,
    expiresIn: Math.max(0, e.expiresAt - now),
  }));
}
