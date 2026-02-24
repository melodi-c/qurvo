import type { Transport, LogFn } from './types';
import { QuotaExceededError, NonRetryableError } from './types';

export class EventQueue {
  private queue: unknown[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;
  private failureCount = 0;
  private retryAfter = 0;
  private readonly maxBackoffMs = 30_000;

  constructor(
    private readonly transport: Transport,
    private readonly endpoint: string,
    private readonly apiKey: string,
    private readonly flushInterval: number = 5000,
    private readonly flushSize: number = 20,
    private readonly maxQueueSize: number = 1000,
    private readonly sendTimeoutMs: number = 30_000,
    private readonly logger?: LogFn,
  ) {}

  enqueue(event: unknown) {
    if (this.queue.length >= this.maxQueueSize) {
      this.queue.shift();
      this.logger?.(`queue full (${this.maxQueueSize}), oldest event dropped`);
    }
    this.queue.push(event);

    if (this.queue.length >= this.flushSize) {
      this.flush();
    }
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.flush(), this.flushInterval);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async flush(): Promise<void> {
    if (this.flushing || this.queue.length === 0) return;
    if (Date.now() < this.retryAfter) return;

    this.flushing = true;
    const batch = this.queue.splice(0, this.flushSize);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.sendTimeoutMs);
      try {
        const ok = await this.transport.send(
          this.endpoint,
          this.apiKey,
          { events: batch, sent_at: new Date().toISOString() },
          { signal: controller.signal },
        );
        if (!ok) {
          this.queue.unshift(...batch);
          this.scheduleBackoff();
          const backoffMs = Math.min(1000 * Math.pow(2, this.failureCount - 1), this.maxBackoffMs);
          this.logger?.(`flush failed, ${batch.length} events re-queued, retry in ${backoffMs}ms`);
        } else {
          this.failureCount = 0;
          this.retryAfter = 0;
        }
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        this.queue.length = 0;
        this.stop();
        this.logger?.('quota exceeded, events dropped and queue stopped');
      } else if (err instanceof NonRetryableError) {
        // 4xx: bad data or auth — drop batch, don't retry (retrying won't help)
        this.logger?.(`non-retryable error (${err.statusCode}), ${batch.length} events dropped`, err);
      } else {
        this.queue.unshift(...batch);
        this.scheduleBackoff();
        this.logger?.(`flush error, ${batch.length} events re-queued`, err);
      }
    } finally {
      this.flushing = false;
    }
  }

  private scheduleBackoff() {
    this.failureCount++;
    const backoffMs = Math.min(1000 * Math.pow(2, this.failureCount - 1), this.maxBackoffMs);
    this.retryAfter = Date.now() + backoffMs;
  }

  async flushAll(): Promise<void> {
    this.retryAfter = 0;
    this.failureCount = 0;
    while (this.queue.length > 0) {
      const sizeBefore = this.queue.length;
      await this.flush();
      if (this.queue.length >= sizeBefore) break;
    }
  }

  async shutdown(timeoutMs: number = 30_000): Promise<void> {
    this.stop();
    if (this.queue.length === 0) return;
    await Promise.race([
      this.flushAll(),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  }

  flushForUnload(): void {
    if (this.queue.length === 0) return;

    const batch = this.queue.splice(0);
    this.transport.send(this.endpoint, this.apiKey, { events: batch, sent_at: new Date().toISOString() }, { keepalive: true }).catch(() => {});
  }

  get size() {
    return this.queue.length;
  }
}
