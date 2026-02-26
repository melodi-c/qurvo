import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import Redis from 'ioredis';
import { Heartbeat } from '@qurvo/heartbeat';
import { REDIS } from '@qurvo/nestjs-infra';
import {
  PENDING_CLAIM_INTERVAL_MS,
  PENDING_IDLE_MS,
  PROCESSOR_BACKPRESSURE_THRESHOLD,
  BACKPRESSURE_DRAIN_DELAY_MS,
  REDIS_CONSUMER_GROUP,
  REDIS_STREAM_EVENTS,
  HEARTBEAT_PATH,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_LOOP_STALE_MS,
  MAX_CONSECUTIVE_ERRORS,
  XREAD_COUNT,
  XREAD_BLOCK_MS,
  ERROR_RETRY_DELAY_MS,
} from '../constants';
import { FlushService } from './flush.service';
import { PersonResolverService } from './person-resolver.service';
import { PersonBatchStore } from './person-batch-store';
import { GeoService } from './geo.service';
import { WarningsBufferService } from './warnings-buffer.service';
import { MetricsService } from '@qurvo/worker-core';
import {
  parseMessages,
  validateMessages,
  prefetchPersons,
  resolveAndBuildEvents,
} from './pipeline';
import type { PipelineContext } from './pipeline/types';

@Injectable()
export class EventConsumerService implements OnApplicationBootstrap {
  private running = false;
  private loopPromise: Promise<void> | null = null;
  private pendingTimer: NodeJS.Timeout | null = null;
  private readonly consumerName = process.env.PROCESSOR_CONSUMER_NAME || `processor-${process.pid}`;
  private readonly heartbeat: Heartbeat;
  private readonly pipelineCtx: PipelineContext;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly flushService: FlushService,
    private readonly personResolver: PersonResolverService,
    private readonly personBatchStore: PersonBatchStore,
    private readonly geoService: GeoService,
    private readonly warningsBuffer: WarningsBufferService,
    private readonly metrics: MetricsService,
    @InjectPinoLogger(EventConsumerService.name) private readonly logger: PinoLogger,
  ) {
    this.heartbeat = new Heartbeat({
      path: HEARTBEAT_PATH,
      intervalMs: HEARTBEAT_INTERVAL_MS,
      staleMs: HEARTBEAT_LOOP_STALE_MS,
      onStale: (loopAge) => this.logger.warn({ loopAge }, 'Consumer loop stale, skipping heartbeat'),
    });
    this.pipelineCtx = {
      personResolver: this.personResolver,
      personBatchStore: this.personBatchStore,
      geoService: this.geoService,
      logger: this.logger,
      onWarning: (w) => this.warningsBuffer.addWarning(w),
    };
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
    } catch (err: unknown) {
      if (!(err instanceof Error) || !err.message.includes('BUSYGROUP')) throw err;
    }
  }

  private async drainIfOverfull(): Promise<void> {
    while (this.flushService.getBufferSize() > PROCESSOR_BACKPRESSURE_THRESHOLD) {
      await this.flushService.flush();
      this.heartbeat.touch();
      await new Promise((r) => setTimeout(r, BACKPRESSURE_DRAIN_DELAY_MS));
    }
  }

  private async startLoop() {
    let consecutiveErrors = 0;

    while (this.running) {
      try {
        await this.drainIfOverfull();

        const results = await this.redis.xreadgroup(
          'GROUP', REDIS_CONSUMER_GROUP, this.consumerName,
          'COUNT', String(XREAD_COUNT),
          'BLOCK', String(XREAD_BLOCK_MS),
          'STREAMS', REDIS_STREAM_EVENTS, '>',
        ) as [string, [string, string[]][]][] | null;

        this.heartbeat.touch();

        if (!results || results.length === 0) continue;

        await this.processMessages(results.flatMap(([, msgs]) => msgs));
        // Fix: only reset after successful processMessages, not on empty XREADGROUP
        consecutiveErrors = 0;
        this.metrics.gauge('processor.consecutive_errors', 0);
      } catch (err) {
        this.heartbeat.touch();
        consecutiveErrors++;
        this.metrics.gauge('processor.consecutive_errors', consecutiveErrors);
        this.logger.error({ err, consecutiveErrors }, 'Error processing messages');

        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          this.logger.fatal({ consecutiveErrors }, 'Too many consecutive errors — exiting for K8s restart');
          process.exit(1);
        }

        await new Promise((r) => setTimeout(r, ERROR_RETRY_DELAY_MS));
      }
    }
  }

  private async claimPendingMessages() {
    try {
      // Sample PEL size for observability
      const pendingInfo = await this.redis.xpending(REDIS_STREAM_EVENTS, REDIS_CONSUMER_GROUP) as [number, ...unknown[]] | null;
      if (pendingInfo && typeof pendingInfo[0] === 'number') {
        this.metrics.gauge('processor.pel_size', pendingInfo[0]);
      }
    } catch {
      // Non-critical — don't let PEL sampling fail the claim cycle
    }

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
          'COUNT', String(XREAD_COUNT),
        ) as [string, [string, string[]][], string[]];

        if (!result || !result[1] || result[1].length === 0) break;

        const deletedIds = result[2];
        if (deletedIds && deletedIds.length > 0) {
          this.logger.warn({ deletedIds }, 'XAUTOCLAIM: some pending messages were deleted from stream (trimming)');
        }

        cursor = result[0];

        // Filter out messages deleted from stream (XAUTOCLAIM returns null fields for these)
        const claimed = result[1].filter(([, fields]) => !!fields);
        if (claimed.length > 0) {
          await this.processMessages(claimed);
        }
      } while (cursor !== '0-0');
    } catch (err) {
      this.logger.error({ err }, 'Error claiming pending messages');
    }
  }

  // ── Pipeline ──────────────────────────────────────────────────────────────────

  private async processMessages(messages: [string, string[]][]): Promise<void> {
    // Step 1: Parse
    const parsed = parseMessages(messages);

    // Step 2: Validate
    const { valid, invalidIds } = validateMessages(parsed, this.pipelineCtx);
    if (invalidIds.length > 0) {
      await this.redis.xack(REDIS_STREAM_EVENTS, REDIS_CONSUMER_GROUP, ...invalidIds);
    }
    if (valid.length === 0) return;

    // Step 3: Prefetch person IDs
    const personCache = await prefetchPersons(valid, this.pipelineCtx);

    // Step 4: Resolve persons + build Event DTOs
    const { buffered, failedIds } = await resolveAndBuildEvents(valid, personCache, this.pipelineCtx);

    if (failedIds.length > 0) {
      this.logger.warn(
        { failedCount: failedIds.length, totalCount: valid.length },
        'Some events failed processing — left in PEL for XAUTOCLAIM re-delivery',
      );
    }

    if (buffered.length > 0) {
      this.flushService.addToBuffer(buffered);
      if (this.flushService.isBufferFull()) {
        await this.flushService.flush();
      }
    }
  }
}
