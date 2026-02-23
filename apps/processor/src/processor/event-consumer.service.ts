import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { writeFileSync } from 'fs';
import Redis from 'ioredis';
import type { Event } from '@qurvo/clickhouse';
import { REDIS } from '../providers/redis.provider';
import {
  PENDING_CLAIM_INTERVAL_MS,
  PENDING_IDLE_MS,
  PROCESSOR_BATCH_SIZE,
  REDIS_CONSUMER_GROUP,
  REDIS_STREAM_EVENTS,
} from '../constants';
import { FlushService, type BufferedEvent } from './flush.service';
import { PersonResolverService } from './person-resolver.service';
import { PersonWriterService } from './person-writer.service';
import { parseRedisFields } from './utils';
import { GeoService } from './geo.service';

@Injectable()
export class EventConsumerService implements OnApplicationBootstrap {
  private running = false;
  private loopPromise: Promise<void> | null = null;
  private pendingTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private lastLoopActivity = 0;
  private static readonly LOOP_STALE_MS = 30_000;
  private readonly consumerName = process.env.PROCESSOR_CONSUMER_NAME || `processor-${process.pid}`;
  private static readonly HEARTBEAT_PATH = '/tmp/processor.heartbeat';

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly flushService: FlushService,
    private readonly personResolver: PersonResolverService,
    private readonly personWriter: PersonWriterService,
    private readonly geoService: GeoService,
    @InjectPinoLogger(EventConsumerService.name) private readonly logger: PinoLogger,
  ) {}

  onApplicationBootstrap() {
    this.running = true;
    this.ensureConsumerGroup()
      .then(() => {
        this.logger.info({ consumer: this.consumerName }, 'Processor started');
        this.loopPromise = this.startLoop();
        this.pendingTimer = setInterval(() => this.claimPendingMessages(), PENDING_CLAIM_INTERVAL_MS);
        this.writeHeartbeat();
        this.heartbeatTimer = setInterval(() => this.writeHeartbeat(), 15_000);
      })
      .catch((err) => this.logger.error({ err }, 'Failed to initialize consumer group'));
  }

  async shutdown() {
    this.running = false;
    if (this.pendingTimer) clearInterval(this.pendingTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    await this.loopPromise;
  }

  private writeHeartbeat() {
    try {
      const loopAge = Date.now() - this.lastLoopActivity;
      if (this.lastLoopActivity > 0 && loopAge > EventConsumerService.LOOP_STALE_MS) {
        this.logger.warn({ loopAge }, 'Consumer loop stale, skipping heartbeat');
        return;
      }
      writeFileSync(EventConsumerService.HEARTBEAT_PATH, Date.now().toString());
    } catch {
      // non-critical: liveness probe will detect stale heartbeat
    }
  }

  private async ensureConsumerGroup() {
    try {
      await this.redis.xgroup('CREATE', REDIS_STREAM_EVENTS, REDIS_CONSUMER_GROUP, '0', 'MKSTREAM');
      this.logger.info('Consumer group created');
    } catch (err: any) {
      if (!err.message?.includes('BUSYGROUP')) throw err;
    }
  }

  private async startLoop() {
    while (this.running) {
      try {
        // Backpressure: wait for buffer to drain before reading more
        while (this.flushService.getBufferSize() > PROCESSOR_BATCH_SIZE * 2) {
          await this.flushService.flush();
          this.lastLoopActivity = Date.now();
          if (this.flushService.getBufferSize() > PROCESSOR_BATCH_SIZE * 2) {
            await new Promise((r) => setTimeout(r, 500));
          }
        }

        const results = await this.redis.xreadgroup(
          'GROUP', REDIS_CONSUMER_GROUP, this.consumerName,
          'COUNT', '100',
          'BLOCK', '2000',
          'STREAMS', REDIS_STREAM_EVENTS, '>',
        ) as [string, [string, string[]][]][] | null;

        this.lastLoopActivity = Date.now();

        if (!results || results.length === 0) continue;

        const buffered = await Promise.all(
          results.flatMap(([, messages]) =>
            messages.map(async ([id, fields]) => ({
              messageId: id,
              event: await this.buildEvent(parseRedisFields(fields)),
            }))
          )
        );
        this.flushService.addToBuffer(buffered);

        if (this.flushService.isBufferFull()) {
          await this.flushService.flush();
        }
      } catch (err) {
        this.lastLoopActivity = Date.now();
        this.logger.error({ err }, 'Error processing messages');
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  private async claimPendingMessages() {
    try {
      let cursor = '0-0';
      do {
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

        const buffered = await Promise.all(
          result[1]
            .filter(([, fields]) => !!fields)
            .map(async ([id, fields]) => ({
              messageId: id,
              event: await this.buildEvent(parseRedisFields(fields)),
            }))
        );
        this.flushService.addToBuffer(buffered);

        if (this.flushService.isBufferFull()) {
          await this.flushService.flush();
        }
      } while (cursor !== '0-0');
    } catch (err) {
      this.logger.error({ err }, 'Error claiming pending messages');
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

    // Fire-and-forget: sync person profile to PostgreSQL, then merge if needed.
    // mergePersons must run after syncPerson to guarantee the FK target exists.
    this.personWriter
      .syncPerson(projectId, personId, data.distinct_id, data.user_properties || '{}')
      .then(() => {
        if (mergedFromPersonId) {
          return this.personWriter.mergePersons(projectId, mergedFromPersonId, personId);
        }
        return undefined;
      })
      .catch((err) => this.logger.error({ err, personId }, 'PersonWriter failed'));

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
      screen_width: Math.max(0, data.screen_width ? parseInt(data.screen_width) : 0),
      screen_height: Math.max(0, data.screen_height ? parseInt(data.screen_height) : 0),
      country,
      region: '',
      city: '',
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
