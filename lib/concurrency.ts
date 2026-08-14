/**
 * Runs `fn` over `items` with at most `concurrency` in flight at once.
 *
 * Lives in its own file (rather than lib/pipeline.ts, where it originated)
 * specifically so lib/sources/searchOrchestrator.ts can use it too without
 * creating a circular import: pipeline.ts -> lib/sources -> redditApisAdapter.ts
 * -> searchOrchestrator.ts would otherwise need to import back from
 * pipeline.ts for this one helper.
 */
export async function mapWithConcurrency<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const item = items[next++]!;
      await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}
