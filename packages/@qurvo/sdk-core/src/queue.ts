import type { Transport } from './types';

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
  ) {}

  enqueue(event: unknown) {
    if (this.queue.length >= this.maxQueueSize) {
      this.queue.shift();
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
    const batch = this.queue.splice(0);

    try {
      const ok = await this.transport.send(this.endpoint, this.apiKey, { events: batch, sent_at: new Date().toISOString() });
      if (!ok) {
        this.queue.unshift(...batch);
        this.scheduleBackoff();
      } else {
        this.failureCount = 0;
        this.retryAfter = 0;
      }
    } catch {
      this.queue.unshift(...batch);
      this.scheduleBackoff();
    } finally {
      this.flushing = false;
    }
  }

  private scheduleBackoff() {
    this.failureCount++;
    const backoffMs = Math.min(1000 * Math.pow(2, this.failureCount - 1), this.maxBackoffMs);
    this.retryAfter = Date.now() + backoffMs;
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
