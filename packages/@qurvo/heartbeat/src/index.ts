import { writeFileSync } from 'fs';

export interface HeartbeatOptions {
  /** Path to the heartbeat file (default: /tmp/processor.heartbeat) */
  path?: string;
  /** Interval in ms between heartbeat writes (default: 15000) */
  intervalMs?: number;
  /** If the loop hasn't called touch() within this many ms, skip writing (default: 30000) */
  staleMs?: number;
  /** Called when the loop is detected as stale */
  onStale?: (loopAgeMs: number) => void;
}

const DEFAULT_PATH = '/tmp/processor.heartbeat';
const DEFAULT_INTERVAL_MS = 15_000;
const DEFAULT_STALE_MS = 30_000;

export class Heartbeat {
  private timer: NodeJS.Timeout | null = null;
  private lastLoopActivity = 0;

  private readonly path: string;
  private readonly intervalMs: number;
  private readonly staleMs: number;
  private readonly onStale?: (loopAgeMs: number) => void;

  constructor(opts: HeartbeatOptions = {}) {
    this.path = opts.path ?? DEFAULT_PATH;
    this.intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.staleMs = opts.staleMs ?? DEFAULT_STALE_MS;
    this.onStale = opts.onStale;
  }

  start(): void {
    this.write();
    this.timer = setInterval(() => this.write(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  touch(): void {
    this.lastLoopActivity = Date.now();
  }

  private write(): void {
    try {
      const loopAge = Date.now() - this.lastLoopActivity;
      if (this.lastLoopActivity > 0 && loopAge > this.staleMs) {
        this.onStale?.(loopAge);
        return;
      }
      writeFileSync(this.path, Date.now().toString());
    } catch {
      // non-critical: liveness probe will detect stale heartbeat
    }
  }
}
