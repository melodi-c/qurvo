import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import Redis from 'ioredis';
import type { ClickHouseClient, Event } from '@qurvo/clickhouse';
import { insertEvents } from './insert';
import { withRetry } from './retry';
import { REDIS } from '../providers/redis.provider';
import { CLICKHOUSE } from '../providers/clickhouse.provider';
import { DefinitionSyncService } from './definition-sync.service';
import { PersonBatchStore } from './person-batch-store';
import {
  PROCESSOR_BATCH_SIZE,
  PROCESSOR_FLUSH_INTERVAL_MS,
  PROCESSOR_MAX_RETRIES,
  REDIS_CONSUMER_GROUP,
  REDIS_DLQ_MAXLEN,
  REDIS_STREAM_DLQ,
  REDIS_STREAM_EVENTS,
} from '../constants';

export interface BufferedEvent {
  messageId: string;
  event: Event;
}

@Injectable()
export class FlushService implements OnApplicationBootstrap {
  private buffer: BufferedEvent[] = [];
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    @InjectPinoLogger(FlushService.name) private readonly logger: PinoLogger,
    private readonly definitionSync: DefinitionSyncService,
    private readonly personBatchStore: PersonBatchStore,
  ) {}

  onApplicationBootstrap() {
    this.scheduleFlush();
  }

  stopTimer() {
    if (this.flushTimer) clearTimeout(this.flushTimer);
  }

  addToBuffer(events: BufferedEvent[]) {
    this.buffer.push(...events);
  }

  isBufferFull(): boolean {
    return this.buffer.length >= PROCESSOR_BATCH_SIZE;
  }

  getBufferSize(): number {
    return this.buffer.length;
  }

  async flush() {
    if (this.buffer.length === 0) return;

    const batch = this.buffer.splice(0);
    const events = batch.map((b) => b.event);
    const messageIds = batch.map((b) => b.messageId);

    // Flush person batch to PG before CH insert (non-critical, same timing as previous fire-and-forget)
    try {
      await this.personBatchStore.flush();
    } catch (err) {
      this.logger.error({ err }, 'Person batch flush failed (non-critical)');
    }

    try {
      await withRetry(
        () => insertEvents(this.ch, events),
        'ClickHouse insert',
        this.logger,
        { maxAttempts: PROCESSOR_MAX_RETRIES, baseDelayMs: 1000 },
      );
      this.logger.info({ eventCount: events.length }, 'Flushed events to ClickHouse');
      await this.redis.xack(REDIS_STREAM_EVENTS, REDIS_CONSUMER_GROUP, ...messageIds);
      try {
        await this.definitionSync.syncFromBatch(events);
      } catch (err) {
        this.logger.warn({ err }, 'Definition sync failed (non-critical)');
      }
    } catch {
      await this.moveToDlq(events);
      await this.redis.xack(REDIS_STREAM_EVENTS, REDIS_CONSUMER_GROUP, ...messageIds);
    }
  }

  private async moveToDlq(events: Event[]): Promise<void> {
    this.logger.error({ eventCount: events.length, maxRetries: PROCESSOR_MAX_RETRIES }, 'Moving events to DLQ after max retries');
    const pipeline = this.redis.pipeline();
    for (const event of events) {
      pipeline.xadd(REDIS_STREAM_DLQ, 'MAXLEN', '~', String(REDIS_DLQ_MAXLEN), '*', 'data', JSON.stringify(event));
    }
    await pipeline.exec();
  }

  private scheduleFlush() {
    this.flushTimer = setTimeout(async () => {
      try {
        await this.flush();
      } catch (err) {
        this.logger.error({ err }, 'Scheduled flush failed');
      }
      this.scheduleFlush();
    }, PROCESSOR_FLUSH_INTERVAL_MS);
  }
}
