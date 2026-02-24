import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import Redis from 'ioredis';
import { REDIS } from '../providers/redis.provider';
import {
  PENDING_CLAIM_INTERVAL_MS,
  PENDING_IDLE_MS,
  PROCESSOR_BATCH_SIZE,
  REDIS_CONSUMER_GROUP,
  REDIS_STREAM_EVENTS,
} from '../constants';
import { FlushService, type BufferedEvent } from './flush.service';
import { EventEnrichmentService } from './event-enrichment.service';
import { HeartbeatService } from './heartbeat.service';
import { parseRedisFields } from './utils';

@Injectable()
export class EventConsumerService implements OnApplicationBootstrap {
  private running = false;
  private loopPromise: Promise<void> | null = null;
  private pendingTimer: NodeJS.Timeout | null = null;
  private readonly consumerName = process.env.PROCESSOR_CONSUMER_NAME || `processor-${process.pid}`;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly flushService: FlushService,
    private readonly enrichment: EventEnrichmentService,
    private readonly heartbeat: HeartbeatService,
    @InjectPinoLogger(EventConsumerService.name) private readonly logger: PinoLogger,
  ) {}

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

  private async startLoop() {
    while (this.running) {
      try {
        while (this.flushService.getBufferSize() > PROCESSOR_BATCH_SIZE * 2) {
          await this.flushService.flush();
          this.heartbeat.touch();
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

        this.heartbeat.touch();

        if (!results || results.length === 0) continue;

        const buffered = await Promise.all(
          results.flatMap(([, messages]) =>
            messages.map(async ([id, fields]) => ({
              messageId: id,
              event: await this.enrichment.buildEvent(parseRedisFields(fields)),
            }))
          )
        );
        this.flushService.addToBuffer(buffered);

        if (this.flushService.isBufferFull()) {
          await this.flushService.flush();
        }
      } catch (err) {
        this.heartbeat.touch();
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
              event: await this.enrichment.buildEvent(parseRedisFields(fields)),
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
}
