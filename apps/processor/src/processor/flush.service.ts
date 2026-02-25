import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import Redis from 'ioredis';
import type { Event } from '@qurvo/clickhouse';
import { REDIS } from '@qurvo/nestjs-infra';
import { BatchWriter } from './batch-writer';
import type { BufferedEvent } from './pipeline';
import {
  PROCESSOR_BATCH_SIZE,
  PROCESSOR_FLUSH_INTERVAL_MS,
  REDIS_CONSUMER_GROUP,
  REDIS_DLQ_MAXLEN,
  REDIS_STREAM_DLQ,
  REDIS_STREAM_EVENTS,
  RETRY_CLICKHOUSE,
} from '../constants';

@Injectable()
export class FlushService implements OnApplicationBootstrap {
  private buffer: BufferedEvent[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private stopped = false;
  private flushPromise: Promise<void> | null = null;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @InjectPinoLogger(FlushService.name) private readonly logger: PinoLogger,
    private readonly batchWriter: BatchWriter,
  ) {}

  onApplicationBootstrap() {
    this.scheduleFlush();
  }

  async shutdown() {
    this.stopped = true;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    if (this.flushPromise) await this.flushPromise;
    await this.flush();
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

  async flush(): Promise<void> {
    if (this.flushPromise || this.buffer.length === 0) return;
    this.flushPromise = this._doFlush();
    try {
      await this.flushPromise;
    } finally {
      this.flushPromise = null;
    }
  }

  private async _doFlush(): Promise<void> {
    const batch = this.buffer.splice(0);
    const events = batch.map((b) => b.event);
    const messageIds = batch.map((b) => b.messageId);

    try {
      // Flush person batch to PG before CH insert.
      // Critical: if PG write fails, events go to DLQ rather than writing to CH
      // with orphaned person_ids that have no PG row.
      await this.batchWriter.write(events);
      this.logger.info({ eventCount: events.length }, 'Flushed events to ClickHouse');
      await this.redis.xack(REDIS_STREAM_EVENTS, REDIS_CONSUMER_GROUP, ...messageIds);
    } catch (err) {
      this.logger.error({ err, eventCount: events.length }, 'Batch failed — routing to DLQ');
      try {
        await this.moveToDlq(events);
        await this.redis.xack(REDIS_STREAM_EVENTS, REDIS_CONSUMER_GROUP, ...messageIds);
      } catch (dlqErr) {
        this.logger.error({ err: dlqErr, eventCount: events.length }, 'DLQ write failed — events will be re-delivered via XAUTOCLAIM');
      }
    }
  }

  private async moveToDlq(events: Event[]): Promise<void> {
    this.logger.error({ eventCount: events.length, maxRetries: RETRY_CLICKHOUSE.maxAttempts }, 'Moving events to DLQ after max retries');
    const pipeline = this.redis.pipeline();
    for (const event of events) {
      pipeline.xadd(REDIS_STREAM_DLQ, 'MAXLEN', '~', String(REDIS_DLQ_MAXLEN), '*', 'data', JSON.stringify(event));
    }
    const results = await pipeline.exec();
    const failed = results?.filter(([err]) => err !== null);
    if (failed && failed.length > 0) {
      const msg = `DLQ pipeline: ${failed.length}/${events.length} writes failed`;
      this.logger.error({ failedCount: failed.length, totalCount: events.length }, msg);
      throw new Error(msg);
    }
  }

  private scheduleFlush() {
    this.flushTimer = setTimeout(async () => {
      try {
        await this.flush();
      } catch (err) {
        this.logger.error({ err }, 'Scheduled flush failed');
      }
      if (!this.stopped) this.scheduleFlush();
    }, PROCESSOR_FLUSH_INTERVAL_MS);
  }
}
