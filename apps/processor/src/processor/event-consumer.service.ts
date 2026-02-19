import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import Redis from 'ioredis';
import type { Event } from '@shot/clickhouse';
import { REDIS } from '../providers/redis.provider';
import {
  PENDING_CLAIM_INTERVAL_MS,
  PENDING_IDLE_MS,
  REDIS_CONSUMER_GROUP,
  REDIS_STREAM_EVENTS,
} from '../constants';
import { FlushService, type BufferedEvent } from './flush.service';
import { PersonResolverService } from './person-resolver.service';
import { PersonWriterService } from './person-writer.service';
import { parseRedisFields } from './utils';
import { lookupGeo } from './geo';

@Injectable()
export class EventConsumerService implements OnApplicationBootstrap {
  private running = false;
  private loopPromise: Promise<void> | null = null;
  private pendingTimer: NodeJS.Timeout | null = null;
  private readonly consumerName = `processor-${process.pid}`;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly flushService: FlushService,
    private readonly personResolver: PersonResolverService,
    private readonly personWriter: PersonWriterService,
    @InjectPinoLogger(EventConsumerService.name) private readonly logger: PinoLogger,
  ) {}

  onApplicationBootstrap() {
    this.running = true;
    this.ensureConsumerGroup()
      .then(() => {
        this.logger.info({ consumer: this.consumerName }, 'Processor started');
        this.loopPromise = this.startLoop();
        this.pendingTimer = setInterval(() => this.claimPendingMessages(), PENDING_CLAIM_INTERVAL_MS);
      })
      .catch((err) => this.logger.error({ err }, 'Failed to initialize consumer group'));
  }

  async shutdown() {
    this.running = false;
    if (this.pendingTimer) clearInterval(this.pendingTimer);
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

  private async startLoop() {
    while (this.running) {
      try {
        const results = await this.redis.xreadgroup(
          'GROUP', REDIS_CONSUMER_GROUP, this.consumerName,
          'COUNT', '100',
          'BLOCK', '2000',
          'STREAMS', REDIS_STREAM_EVENTS, '>',
        ) as [string, [string, string[]][]][] | null;

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
    const geo = lookupGeo(data.ip || '');
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
      screen_width: data.screen_width ? parseInt(data.screen_width) : undefined,
      screen_height: data.screen_height ? parseInt(data.screen_height) : undefined,
      country: geo.country,
      region: geo.region,
      city: geo.city,
      language: data.language,
      timezone: data.timezone,
      properties: data.properties,
      user_properties: data.user_properties,
      sdk_name: data.sdk_name,
      sdk_version: data.sdk_version,
      timestamp: data.timestamp || new Date().toISOString(),
      batch_id: data.batch_id,
    };
  }
}
