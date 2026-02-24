import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import type { ClickHouseClient, Event } from '@qurvo/clickhouse';
import { withRetry } from './retry';
import { parseRedisFields } from './redis-utils';
import { REDIS, CLICKHOUSE } from '@qurvo/nestjs-infra';
import {
  DLQ_CIRCUIT_BREAKER_RESET_MS,
  DLQ_CIRCUIT_BREAKER_THRESHOLD,
  DLQ_CIRCUIT_KEY,
  DLQ_FAILURES_KEY,
  DLQ_REPLAY_BATCH,
  DLQ_REPLAY_INTERVAL_MS,
  REDIS_STREAM_DLQ,
  RETRY_CLICKHOUSE,
} from '../constants';
import { DistributedLock } from '@qurvo/distributed-lock';
import { PersonBatchStore } from './person-batch-store';
import { DefinitionSyncService } from './definition-sync.service';

@Injectable()
export class DlqService implements OnApplicationBootstrap {
  private dlqTimer: NodeJS.Timeout | null = null;
  private stopped = false;
  private readonly lock: DistributedLock;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    @InjectPinoLogger(DlqService.name) private readonly logger: PinoLogger,
    private readonly personBatchStore: PersonBatchStore,
    private readonly definitionSync: DefinitionSyncService,
  ) {
    this.lock = new DistributedLock(redis, 'dlq:replay:lock', randomUUID(), 30);
  }

  onApplicationBootstrap() {
    this.scheduleReplay();
  }

  stop() {
    this.stopped = true;
    if (this.dlqTimer) {
      clearTimeout(this.dlqTimer);
      this.dlqTimer = null;
    }
  }

  private scheduleReplay() {
    this.dlqTimer = setTimeout(async () => {
      await this.replayDlq();
      if (!this.stopped) this.scheduleReplay();
    }, DLQ_REPLAY_INTERVAL_MS);
  }

  private async replayDlq() {
    if (await this.redis.exists(DLQ_CIRCUIT_KEY)) {
      this.logger.warn('DLQ circuit breaker open, skipping replay');
      return;
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
      await this.personBatchStore.flush();

      await withRetry(
        () => this.ch.insert({
          table: 'events',
          values: events,
          format: 'JSONEachRow',
        }),
        'DLQ ClickHouse insert',
        this.logger,
        RETRY_CLICKHOUSE,
      );
      await this.redis.xdel(REDIS_STREAM_DLQ, ...ids);
      await this.redis.del(DLQ_FAILURES_KEY, DLQ_CIRCUIT_KEY);

      // Sync definitions (non-critical — errors logged but don't fail the replay)
      try {
        await this.definitionSync.syncFromBatch(events);
      } catch (err) {
        this.logger.warn({ err }, 'DLQ definition sync failed (non-critical)');
      }

      this.logger.info({ replayed: events.length }, 'Replayed events from DLQ');
    } catch (err) {
      const failures = await this.redis.incr(DLQ_FAILURES_KEY);
      // TTL = 2× reset period so counter auto-expires if replays stop failing
      await this.redis.pexpire(DLQ_FAILURES_KEY, DLQ_CIRCUIT_BREAKER_RESET_MS * 2);
      if (failures >= DLQ_CIRCUIT_BREAKER_THRESHOLD) {
        await this.redis.set(DLQ_CIRCUIT_KEY, '1', 'PX', DLQ_CIRCUIT_BREAKER_RESET_MS);
        await this.redis.del(DLQ_FAILURES_KEY);
        this.logger.warn({ failures }, 'DLQ circuit breaker opened');
      }
      this.logger.error({ err, failures }, 'DLQ replay failed');
    } finally {
      await this.lock.release().catch((err) => this.logger.warn({ err }, 'DLQ lock release failed'));
    }
  }
}
