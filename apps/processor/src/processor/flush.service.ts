import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import Redis from 'ioredis';
import type { ClickHouseClient, Event } from '@qurvo/clickhouse';
import { insertEvents } from './insert';
import { REDIS } from '../providers/redis.provider';
import { CLICKHOUSE } from '../providers/clickhouse.provider';
import { DefinitionSyncService } from './definition-sync.service';
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
    let retries = 0;

    while (retries < PROCESSOR_MAX_RETRIES) {
      try {
        await insertEvents(this.ch, events);
        this.logger.info({ eventCount: events.length }, 'Flushed events to ClickHouse');
        await this.redis.xack(REDIS_STREAM_EVENTS, REDIS_CONSUMER_GROUP, ...messageIds);
        await this.invalidateMetadataCaches(events);
        void this.definitionSync.syncFromBatch(events);
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

  /**
   * Tracks known event names and property keys per project in Redis SETs.
   * Only invalidates caches when genuinely new names/keys appear (SADD returns > 0).
   */
  private async invalidateMetadataCaches(events: Event[]) {
    const projectEventNames = new Map<string, Set<string>>();
    const projectPropKeys = new Map<string, Set<string>>();

    for (const e of events) {
      if (!projectEventNames.has(e.project_id)) {
        projectEventNames.set(e.project_id, new Set());
      }
      projectEventNames.get(e.project_id)!.add(e.event_name);

      if (!projectPropKeys.has(e.project_id)) {
        projectPropKeys.set(e.project_id, new Set());
      }
      const keys = projectPropKeys.get(e.project_id)!;

      if (e.properties && e.properties !== '{}') {
        try {
          for (const k of Object.keys(JSON.parse(e.properties))) keys.add(`properties.${k}`);
        } catch {}
      }
      if (e.user_properties && e.user_properties !== '{}') {
        try {
          for (const k of Object.keys(JSON.parse(e.user_properties))) keys.add(`user_properties.${k}`);
        } catch {}
      }
    }

    // Pipeline: SADD known names + known prop keys for each project
    const pipeline = this.redis.pipeline();
    const ops: Array<{ projectId: string; type: 'names' | 'props'; eventNames: string[] }> = [];

    for (const [projectId, names] of projectEventNames) {
      pipeline.sadd(`known_event_names:${projectId}`, ...names);
      ops.push({ projectId, type: 'names', eventNames: [...names] });
    }
    for (const [projectId, keys] of projectPropKeys) {
      if (keys.size > 0) {
        pipeline.sadd(`known_prop_keys:${projectId}`, ...keys);
        ops.push({ projectId, type: 'props', eventNames: [...(projectEventNames.get(projectId) || [])] });
      }
    }

    try {
      const results = await pipeline.exec();
      if (!results) return;

      const keysToDelete: string[] = [];

      for (let i = 0; i < results.length; i++) {
        const [err, added] = results[i]!;
        if (err || (added as number) === 0) continue;

        const op = ops[i]!;
        if (op.type === 'names') {
          keysToDelete.push(`event_names:${op.projectId}`);
        } else {
          // Invalidate global + event-scoped property name caches
          keysToDelete.push(`event_property_names:${op.projectId}`);
          for (const en of op.eventNames) {
            keysToDelete.push(`event_property_names:${op.projectId}:${en}`);
          }
        }
      }

      if (keysToDelete.length > 0) {
        await this.redis.del(...keysToDelete);
        this.logger.info({ keys: keysToDelete }, 'Invalidated metadata caches (new names/properties detected)');
      }
    } catch (err) {
      this.logger.warn({ err }, 'Failed to invalidate metadata caches');
    }
  }

  private scheduleFlush() {
    this.flushTimer = setTimeout(async () => {
      await this.flush();
      this.scheduleFlush();
    }, PROCESSOR_FLUSH_INTERVAL_MS);
  }
}
