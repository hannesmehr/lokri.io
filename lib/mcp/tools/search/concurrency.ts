/**
 * `withConcurrencyLimit` — Parallel-Runner mit hartem Limit.
 *
 * Alternative zu `Promise.all(items.map(worker))`, die unbegrenzt
 * parallelisiert. Pattern: eine Handvoll Worker-Coroutines, die sich
 * von einem gemeinsamen Cursor Items ziehen. Rejections werden per
 * Item gecatcht und in `PromiseSettledResult`-Shape verpackt — der
 * Aufrufer erfährt nie einen unhandled-rejection.
 *
 * Wohnt in einer eigenen Datei, damit Tests ihn ohne den DB-Import-
 * Graphen von `./index.ts` laden können (`search/index.ts` zieht
 * `lib/db` über `listExternalSourcesForSpaces`). Falls ein zweiter
 * Callsite irgendwo im Projekt auftaucht, nach `lib/util/` ziehen.
 */

export async function withConcurrencyLimit<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;

  async function next(): Promise<void> {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      try {
        results[idx] = {
          status: "fulfilled",
          value: await worker(items[idx], idx),
        };
      } catch (reason) {
        results[idx] = { status: "rejected", reason };
      }
    }
  }

  const parallelism = Math.max(1, Math.min(limit, items.length));
  await Promise.all(
    Array.from({ length: parallelism }, () => next()),
  );
  return results;
}
