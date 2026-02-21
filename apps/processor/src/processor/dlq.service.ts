import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import type { ClickHouseClient, Event } from '@qurvo/clickhouse';
import { insertEvents } from './insert';
import { REDIS } from '../providers/redis.provider';
import { CLICKHOUSE } from '../providers/clickhouse.provider';
import {
  DLQ_CIRCUIT_BREAKER_RESET_MS,
  DLQ_CIRCUIT_BREAKER_THRESHOLD,
  DLQ_REPLAY_BATCH,
  DLQ_REPLAY_INTERVAL_MS,
  REDIS_STREAM_DLQ,
} from '../constants';
import { parseRedisFields } from './utils';

@Injectable()
export class DlqService implements OnApplicationBootstrap {
  private dlqTimer: NodeJS.Timeout | null = null;
  private consecutiveFailures = 0;
  private circuitOpenedAt: number | null = null;
  private readonly instanceId = randomUUID();

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    @InjectPinoLogger(DlqService.name) private readonly logger: PinoLogger,
  ) {}

  onApplicationBootstrap() {
    this.dlqTimer = setInterval(() => this.replayDlq(), DLQ_REPLAY_INTERVAL_MS);
  }

  stop() {
    if (this.dlqTimer) clearInterval(this.dlqTimer);
  }

  private async replayDlq() {
    if (this.consecutiveFailures >= DLQ_CIRCUIT_BREAKER_THRESHOLD) {
      const elapsed = this.circuitOpenedAt ? Date.now() - this.circuitOpenedAt : Infinity;
      if (elapsed < DLQ_CIRCUIT_BREAKER_RESET_MS) {
        this.logger.warn({ consecutiveFailures: this.consecutiveFailures }, 'DLQ circuit breaker open, skipping replay');
        return;
      }
      this.logger.info({ consecutiveFailures: this.consecutiveFailures }, 'DLQ circuit breaker half-open, attempting replay');
    }

    const hasLock = await this.tryAcquireLock();
    if (!hasLock) {
      this.logger.debug('DLQ replay skipped: another instance holds the lock');
      return;
    }

    try {
      const entries = await this.redis.xrange(REDIS_STREAM_DLQ, '-', '+', 'COUNT', DLQ_REPLAY_BATCH) as [string, string[]][];
      if (!entries || entries.length === 0) return;

      const ids = entries.map(([id]) => id);
      const events: Event[] = entries
        .map(([, fields]) => {
          const obj = parseRedisFields(fields);
          if (!obj.data) return null;
          const event = JSON.parse(obj.data) as Event;
          if (event.screen_width != null) event.screen_width = Math.max(0, event.screen_width);
          if (event.screen_height != null) event.screen_height = Math.max(0, event.screen_height);
          return event;
        })
        .filter((e): e is Event => e !== null);

      await insertEvents(this.ch, events);
      await this.redis.xdel(REDIS_STREAM_DLQ, ...ids);
      this.consecutiveFailures = 0;
      this.circuitOpenedAt = null;
      this.logger.info({ replayed: events.length }, 'Replayed events from DLQ');
    } catch (err) {
      this.consecutiveFailures++;
      if (this.consecutiveFailures === DLQ_CIRCUIT_BREAKER_THRESHOLD) {
        this.circuitOpenedAt = Date.now();
      }
      this.logger.error({ err, consecutiveFailures: this.consecutiveFailures }, 'DLQ replay failed');
    } finally {
      await this.releaseLock();
    }
  }

  private async tryAcquireLock(): Promise<boolean> {
    const result = await this.redis.set(
      'dlq:replay:lock',
      this.instanceId,
      'EX',
      30,
      'NX',
    );
    return result !== null;
  }

  private async releaseLock(): Promise<void> {
    const script = `
      if redis.call('get', KEYS[1]) == ARGV[1] then
        return redis.call('del', KEYS[1])
      else
        return 0
      end
    `;
    await this.redis.eval(script, 1, 'dlq:replay:lock', this.instanceId);
  }
}
