import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import type { Event } from '@qurvo/clickhouse';
import { parseRedisFields } from './redis-utils';
import { REDIS } from '@qurvo/nestjs-infra';
import {
  DLQ_CIRCUIT_BREAKER_RESET_MS,
  DLQ_CIRCUIT_BREAKER_THRESHOLD,
  DLQ_CIRCUIT_KEY,
  DLQ_FAILURES_KEY,
  DLQ_REPLAY_BATCH,
  DLQ_REPLAY_INTERVAL_MS,
  REDIS_STREAM_DLQ,
} from '../constants';
import { DistributedLock } from '@qurvo/distributed-lock';
import { PersonBatchStore } from './person-batch-store';
import { BatchWriter } from './batch-writer';
import { MetricsService } from './metrics.service';

@Injectable()
export class DlqService implements OnApplicationBootstrap {
  private dlqTimer: NodeJS.Timeout | null = null;
  private stopped = false;
  private replayPromise: Promise<void> | null = null;
  private readonly lock: DistributedLock;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @InjectPinoLogger(DlqService.name) private readonly logger: PinoLogger,
    private readonly personBatchStore: PersonBatchStore,
    private readonly batchWriter: BatchWriter,
    private readonly metrics: MetricsService,
  ) {
    this.lock = new DistributedLock(redis, 'dlq:replay:lock', randomUUID(), 300);
  }

  onApplicationBootstrap() {
    this.scheduleReplay();
  }

  async stop() {
    this.stopped = true;
    if (this.dlqTimer) {
      clearTimeout(this.dlqTimer);
      this.dlqTimer = null;
    }
    if (this.replayPromise) await this.replayPromise;
  }

  private scheduleReplay() {
    this.dlqTimer = setTimeout(async () => {
      this.replayPromise = this.replayDlq();
      try {
        await this.replayPromise;
      } catch (err) {
        this.logger.error({ err }, 'DLQ replay threw unexpectedly');
      } finally {
        this.replayPromise = null;
      }
      if (!this.stopped) this.scheduleReplay();
    }, DLQ_REPLAY_INTERVAL_MS);
  }

  private async replayDlq() {
    if (await this.redis.exists(DLQ_CIRCUIT_KEY)) {
      this.logger.warn('DLQ circuit breaker open, skipping replay');
      return;
    }

    // Sample DLQ size for observability (best-effort, non-critical)
    try {
      const dlqLen = await this.redis.xlen(REDIS_STREAM_DLQ);
      this.metrics.dlqSize.set(dlqLen);
    } catch {
      // Non-critical
    }

    const hasLock = await this.lock.acquire();
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
          return JSON.parse(obj.data) as Event;
        })
        .filter((e): e is Event => e !== null);

      // Re-enqueue person data so PG rows are created (they may have been lost
      // when the original personBatchStore.flush() failed and routed events to DLQ).
      for (const event of events) {
        if (event.person_id && event.distinct_id && event.project_id) {
          this.personBatchStore.enqueue(
            event.project_id, event.person_id, event.distinct_id,
            event.user_properties || '{}',
          );
        }
      }

      // PersonBatchStore.flush() uses a promise-based lock: if FlushService is mid-flush,
      // this call awaits its completion and then runs a fresh flush with DLQ person data.
      // batchWriter.write() handles: personBatchStore.flush() → ch.insert() → definitionSync (non-critical)
      await this.batchWriter.write(events);
      await this.redis.xdel(REDIS_STREAM_DLQ, ...ids);
      await this.redis.del(DLQ_FAILURES_KEY, DLQ_CIRCUIT_KEY);

      this.logger.info({ replayed: events.length }, 'Replayed events from DLQ');
    } catch (err) {
      this.logger.error({ err }, 'DLQ replay failed');
      try {
        const failures = await this.redis.incr(DLQ_FAILURES_KEY);
        // TTL = 2× reset period so counter auto-expires if replays stop failing
        await this.redis.pexpire(DLQ_FAILURES_KEY, DLQ_CIRCUIT_BREAKER_RESET_MS * 2);
        if (failures >= DLQ_CIRCUIT_BREAKER_THRESHOLD) {
          await this.redis.set(DLQ_CIRCUIT_KEY, '1', 'PX', DLQ_CIRCUIT_BREAKER_RESET_MS);
          await this.redis.del(DLQ_FAILURES_KEY);
          this.logger.warn({ failures }, 'DLQ circuit breaker opened');
        }
      } catch (cbErr) {
        this.logger.warn({ err: cbErr }, 'DLQ circuit breaker update failed — Redis unavailable');
      }
    } finally {
      await this.lock.release().catch((err) => this.logger.warn({ err }, 'DLQ lock release failed'));
    }
  }

}
