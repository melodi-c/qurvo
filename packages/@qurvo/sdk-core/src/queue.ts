import type { Transport, LogFn, QueuePersistence } from './types';
import { QuotaExceededError, NonRetryableError } from './types';

export class EventQueue {
  private queue: unknown[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;
  private inFlightBatch: unknown[] | null = null;
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
    private readonly persistence?: QueuePersistence,
  ) {
    if (this.persistence) {
      try {
        const persisted = this.persistence.load();
        if (persisted.length > 0) {
          this.queue.push(...persisted);
          this.logger?.(`restored ${persisted.length} events from persistence`);
        }
      } catch {
        this.logger?.('failed to restore persisted events');
      }
    }
  }

  enqueue(event: unknown) {
    if (this.queue.length >= this.maxQueueSize) {
      this.queue.shift();
      this.logger?.(`queue full (${this.maxQueueSize}), oldest event dropped`);
    }
    this.queue.push(event);
    this.persist();

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
    this.inFlightBatch = this.queue.splice(0, this.flushSize);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.sendTimeoutMs);
      try {
        const ok = await this.transport.send(
          this.endpoint,
          this.apiKey,
          { events: this.inFlightBatch, sent_at: new Date().toISOString() },
          { signal: controller.signal },
        );
        if (!ok) {
          this.queue.unshift(...this.inFlightBatch);
          this.scheduleBackoff();
          const backoffMs = Math.min(1000 * Math.pow(2, this.failureCount - 1), this.maxBackoffMs);
          this.logger?.(`flush failed, ${this.inFlightBatch.length} events re-queued, retry in ${backoffMs}ms`);
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
        this.inFlightBatch = null;
        this.stop();
        this.logger?.('quota exceeded, events dropped and queue stopped');
      } else if (err instanceof NonRetryableError) {
        this.logger?.(`non-retryable error (${err.statusCode}), ${this.inFlightBatch.length} events dropped`, err);
      } else {
        this.queue.unshift(...this.inFlightBatch);
        this.scheduleBackoff();
        this.logger?.(`flush error, ${this.inFlightBatch.length} events re-queued`, err);
      }
    } finally {
      this.inFlightBatch = null;
      this.flushing = false;
      this.persist();
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
    if (this.size === 0) return;
    await Promise.race([
      this.flushAll(),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  }

  flushForUnload(): void {
    const batch = [...(this.inFlightBatch || []), ...this.queue.splice(0)];
    this.inFlightBatch = null;
    this.persist();
    if (batch.length === 0) return;

    this.transport.send(this.endpoint, this.apiKey, { events: batch, sent_at: new Date().toISOString() }, { keepalive: true }).catch(() => {});
  }

  get size() {
    return this.queue.length + (this.inFlightBatch?.length || 0);
  }

  private persist() {
    try {
      this.persistence?.save(this.queue);
    } catch {
      // persistence is best-effort
    }
  }
}
