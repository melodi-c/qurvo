/**
 * Simple concurrency limiter for dashboard widget refresh requests.
 * Limits parallel API calls to prevent overwhelming the server.
 */
class ConcurrencyLimiter {
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(private readonly maxConcurrent: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.running >= this.maxConcurrent) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.running++;
    try {
      return await fn();
    } finally {
      this.running--;
      this.queue.shift()?.();
    }
  }
}

/** Shared limiter for all dashboard widget refresh operations. Max 4 concurrent. */
export const refreshLimiter = new ConcurrencyLimiter(4);
