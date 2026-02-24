import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { writeFileSync } from 'fs';

const HEARTBEAT_PATH = '/tmp/processor.heartbeat';
const HEARTBEAT_INTERVAL_MS = 15_000;
const LOOP_STALE_MS = 30_000;

@Injectable()
export class HeartbeatService {
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private lastLoopActivity = 0;

  constructor(
    @InjectPinoLogger(HeartbeatService.name)
    private readonly logger: PinoLogger,
  ) {}

  start() {
    this.write();
    this.heartbeatTimer = setInterval(() => this.write(), HEARTBEAT_INTERVAL_MS);
  }

  stop() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  touch() {
    this.lastLoopActivity = Date.now();
  }

  private write() {
    try {
      const loopAge = Date.now() - this.lastLoopActivity;
      if (this.lastLoopActivity > 0 && loopAge > LOOP_STALE_MS) {
        this.logger.warn({ loopAge }, 'Consumer loop stale, skipping heartbeat');
        return;
      }
      writeFileSync(HEARTBEAT_PATH, Date.now().toString());
    } catch {
      // non-critical: liveness probe will detect stale heartbeat
    }
  }
}
