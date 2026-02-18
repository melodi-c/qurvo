import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import Redis from 'ioredis';
import type { ClickHouseClient, Event } from '@shot/clickhouse';
import { insertEvents } from './insert';
import { REDIS } from '../providers/redis.provider';
import { CLICKHOUSE } from '../providers/clickhouse.provider';
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

  async flush() {
    if (this.buffer.length === 0) return;

    const batch = this.buffer.splice(0);
    const events = batch.map((b) => b.event);
    const messageIds = batch.map((b) => b.messageId);
    let retries = 0;

    while (retries < PROCESSOR_MAX_RETRIES) {
      try {
        await insertEvents(this.ch, events);
        this.logger.info({ eventCount: events.length }, 'Flushed events to ClickHouse');
        await this.redis.xack(REDIS_STREAM_EVENTS, REDIS_CONSUMER_GROUP, ...messageIds);
        return;
      } catch (err) {
        retries++;
        this.logger.error({ err, attempt: retries, maxRetries: PROCESSOR_MAX_RETRIES }, 'ClickHouse insert failed');
        await new Promise((r) => setTimeout(r, 1000 * retries));
      }
    }

    this.logger.error({ eventCount: events.length, maxRetries: PROCESSOR_MAX_RETRIES }, 'Moving events to DLQ after max retries');
    const pipeline = this.redis.pipeline();
    for (const event of events) {
      pipeline.xadd(REDIS_STREAM_DLQ, 'MAXLEN', '~', String(REDIS_DLQ_MAXLEN), '*', 'data', JSON.stringify(event));
    }
    await pipeline.exec();
    await this.redis.xack(REDIS_STREAM_EVENTS, REDIS_CONSUMER_GROUP, ...messageIds);
  }

  private scheduleFlush() {
    this.flushTimer = setTimeout(async () => {
      await this.flush();
      this.scheduleFlush();
    }, PROCESSOR_FLUSH_INTERVAL_MS);
  }
}
