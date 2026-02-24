import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import Redis from 'ioredis';
import type { Event } from '@qurvo/clickhouse';
import { Heartbeat } from '@qurvo/heartbeat';
import { REDIS } from '@qurvo/nestjs-infra';
import {
  PENDING_CLAIM_INTERVAL_MS,
  PENDING_IDLE_MS,
  PROCESSOR_BACKPRESSURE_THRESHOLD,
  REDIS_CONSUMER_GROUP,
  REDIS_STREAM_EVENTS,
  HEARTBEAT_PATH,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_LOOP_STALE_MS,
} from '../constants';
import { FlushService } from './flush.service';
import { PersonResolverService } from './person-resolver.service';
import { PersonBatchStore } from './person-batch-store';
import { GeoService } from './geo.service';
import { parseRedisFields } from './redis-utils';
import { safeScreenDimension, groupByKey } from './event-utils';

const REQUIRED_FIELDS = ['project_id', 'event_name', 'distinct_id'] as const;

// Garbage distinct_ids that SDKs or broken clients may send — silently drop these events
const ILLEGAL_DISTINCT_IDS = new Set([
  'anonymous', 'null', 'undefined', 'none', 'nil',
  '[object Object]', 'NaN', 'true', 'false', '0',
]);

const MAX_CONSECUTIVE_ERRORS = 100;

@Injectable()
export class EventConsumerService implements OnApplicationBootstrap {
  private running = false;
  private loopPromise: Promise<void> | null = null;
  private pendingTimer: NodeJS.Timeout | null = null;
  private readonly consumerName = process.env.PROCESSOR_CONSUMER_NAME || `processor-${process.pid}`;
  private readonly heartbeat: Heartbeat;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly flushService: FlushService,
    private readonly personResolver: PersonResolverService,
    private readonly personBatchStore: PersonBatchStore,
    private readonly geoService: GeoService,
    @InjectPinoLogger(EventConsumerService.name) private readonly logger: PinoLogger,
  ) {
    this.heartbeat = new Heartbeat({
      path: HEARTBEAT_PATH,
      intervalMs: HEARTBEAT_INTERVAL_MS,
      staleMs: HEARTBEAT_LOOP_STALE_MS,
      onStale: (loopAge) => this.logger.warn({ loopAge }, 'Consumer loop stale, skipping heartbeat'),
    });
  }

  onApplicationBootstrap() {
    this.running = true;
    this.ensureConsumerGroup()
      .then(() => {
        this.logger.info({ consumer: this.consumerName }, 'Processor started');
        this.loopPromise = this.startLoop();
        this.pendingTimer = setInterval(() => this.claimPendingMessages(), PENDING_CLAIM_INTERVAL_MS);
        this.heartbeat.start();
      })
      .catch((err) => this.logger.error({ err }, 'Failed to initialize consumer group'));
  }

  async shutdown() {
    this.running = false;
    if (this.pendingTimer) clearInterval(this.pendingTimer);
    this.heartbeat.stop();
    await this.loopPromise;
  }

  private async ensureConsumerGroup() {
    try {
      await this.redis.xgroup('CREATE', REDIS_STREAM_EVENTS, REDIS_CONSUMER_GROUP, '0', 'MKSTREAM');
      this.logger.info('Consumer group created');
    } catch (err: any) {
      if (!err.message?.includes('BUSYGROUP')) throw err;
    }
  }

  private async drainIfOverfull(): Promise<void> {
    while (this.flushService.getBufferSize() > PROCESSOR_BACKPRESSURE_THRESHOLD) {
      await this.flushService.flush();
      this.heartbeat.touch();
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  private async startLoop() {
    let consecutiveErrors = 0;

    while (this.running) {
      try {
        await this.drainIfOverfull();

        const results = await this.redis.xreadgroup(
          'GROUP', REDIS_CONSUMER_GROUP, this.consumerName,
          'COUNT', '100',
          'BLOCK', '2000',
          'STREAMS', REDIS_STREAM_EVENTS, '>',
        ) as [string, [string, string[]][]][] | null;

        this.heartbeat.touch();
        consecutiveErrors = 0;

        if (!results || results.length === 0) continue;

        await this.processMessages(results.flatMap(([, msgs]) => msgs));
      } catch (err) {
        this.heartbeat.touch();
        consecutiveErrors++;
        this.logger.error({ err, consecutiveErrors }, 'Error processing messages');

        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          this.logger.fatal({ consecutiveErrors }, 'Too many consecutive errors — exiting for K8s restart');
          process.exit(1);
        }

        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  private async claimPendingMessages() {
    try {
      let cursor = '0-0';
      do {
        if (!this.running) break;

        const result = await this.redis.call(
          'XAUTOCLAIM',
          REDIS_STREAM_EVENTS,
          REDIS_CONSUMER_GROUP,
          this.consumerName,
          PENDING_IDLE_MS,
          cursor,
          'COUNT', '100',
        ) as [string, [string, string[]][], string[]];

        if (!result || !result[1] || result[1].length === 0) break;

        const deletedIds = result[2];
        if (deletedIds && deletedIds.length > 0) {
          this.logger.warn({ deletedIds }, 'XAUTOCLAIM: some pending messages were deleted from stream (trimming)');
        }

        cursor = result[0];

        await this.processMessages(result[1], true);
      } while (cursor !== '0-0');
    } catch (err) {
      this.logger.error({ err }, 'Error claiming pending messages');
    }
  }

  private async processMessages(
    messages: [string, string[]][],
    filterEmpty = false,
  ): Promise<void> {
    const items = filterEmpty ? messages.filter(([, fields]) => !!fields) : messages;

    const parsed = items.map(([id, fields]) => ({
      id,
      fields: parseRedisFields(fields),
    }));

    // Validate: drop events missing required fields or with garbage distinct_ids
    const valid: typeof parsed = [];
    const invalidIds: string[] = [];
    for (const item of parsed) {
      const missing = REQUIRED_FIELDS.filter((f) => !item.fields[f]);
      if (missing.length > 0) {
        this.logger.warn({ messageId: item.id, missingFields: missing }, 'Dropping invalid event');
        invalidIds.push(item.id);
      } else if (ILLEGAL_DISTINCT_IDS.has(item.fields.distinct_id.trim().toLowerCase())) {
        this.logger.warn({ messageId: item.id, distinctId: item.fields.distinct_id }, 'Dropping event with illegal distinct_id');
        invalidIds.push(item.id);
      } else {
        valid.push(item);
      }
    }

    // XACK invalid messages so they don't get stuck in PEL
    if (invalidIds.length > 0) {
      await this.redis.xack(REDIS_STREAM_EVENTS, REDIS_CONSUMER_GROUP, ...invalidIds);
    }
    if (valid.length === 0) return;

    // Group by project+distinctId: concurrent between users, sequential within
    const groups = groupByKey(valid, (item) =>
      `${item.fields.project_id}:${item.fields.distinct_id}`,
    );

    const groupResults = await Promise.all(
      [...groups.values()].map(async (group) => {
        const results: { messageId: string; event: Event }[] = [];
        for (const item of group) {
          results.push({
            messageId: item.id,
            event: await this.buildEvent(item.fields),
          });
        }
        return results;
      }),
    );

    this.flushService.addToBuffer(groupResults.flat());
    if (this.flushService.isBufferFull()) {
      await this.flushService.flush();
    }
  }

  private async buildEvent(data: Record<string, string>): Promise<Event> {
    const ip = data.ip || '';
    const country = this.geoService.lookupCountry(ip);
    const projectId = data.project_id || '';

    let personId: string;
    let mergedFromPersonId: string | null = null;

    if (data.event_name === '$identify' && data.anonymous_id) {
      const result = await this.personResolver.handleIdentify(projectId, data.distinct_id, data.anonymous_id);
      personId = result.personId;
      mergedFromPersonId = result.mergedFromPersonId;
    } else {
      personId = await this.personResolver.resolve(projectId, data.distinct_id);
    }

    this.personBatchStore.enqueue(projectId, personId, data.distinct_id, data.user_properties || '{}');
    if (mergedFromPersonId) {
      this.personBatchStore.enqueueMerge(projectId, mergedFromPersonId, personId);
    }

    return {
      event_id: data.event_id || '',
      project_id: projectId,
      event_name: data.event_name || '',
      event_type: data.event_type || 'track',
      distinct_id: data.distinct_id || '',
      anonymous_id: data.anonymous_id,
      user_id: data.user_id,
      person_id: personId,
      session_id: data.session_id,
      url: data.url,
      referrer: data.referrer,
      page_title: data.page_title,
      page_path: data.page_path,
      device_type: data.device_type,
      browser: data.browser,
      browser_version: data.browser_version,
      os: data.os,
      os_version: data.os_version,
      screen_width: safeScreenDimension(data.screen_width),
      screen_height: safeScreenDimension(data.screen_height),
      country,
      language: data.language,
      timezone: data.timezone,
      properties: data.properties,
      user_properties: data.user_properties,
      sdk_name: data.sdk_name,
      sdk_version: data.sdk_version,
      timestamp: data.timestamp || new Date().toISOString(),
      batch_id: data.batch_id,
      ip,
    };
  }
}
