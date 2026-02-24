/**
 * Time-bucketed deduplication cache.
 *
 * Keys are considered "seen" within the floored-hour window.
 * When the cache reaches `maxSize`, entries from previous hours are evicted.
 */
export class HourlyCache {
  private readonly map = new Map<string, number>();

  constructor(private readonly maxSize = 100_000) {}

  get size(): number {
    return this.map.size;
  }

  /** Returns true if the key was already seen in the given floored-hour window. */
  has(key: string, flooredMs: number): boolean {
    return this.map.get(key) === flooredMs;
  }

  /**
   * Mark keys as seen. Evicts stale entries when full.
   * Returns false if cache was still full after eviction (remaining keys skipped).
   */
  markSeen(keys: Iterable<string>, flooredMs: number): boolean {
    for (const key of keys) {
      if (this.map.size >= this.maxSize) {
        this.evict(flooredMs);
        if (this.map.size >= this.maxSize) return false;
      }
      this.map.set(key, flooredMs);
    }
    return true;
  }

  uncache(keys: Iterable<string>): void {
    for (const key of keys) this.map.delete(key);
  }

  private evict(currentFlooredMs: number): void {
    for (const [k, v] of this.map) {
      if (v < currentFlooredMs) this.map.delete(k);
    }
  }
}
