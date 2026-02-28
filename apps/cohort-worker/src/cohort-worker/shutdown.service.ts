import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import Redis from 'ioredis';
import { type QueueEvents } from 'bullmq';
import { type ClickHouseClient } from '@qurvo/clickhouse';
import { type Database } from '@qurvo/db';
import { REDIS, CLICKHOUSE, DRIZZLE } from '@qurvo/nestjs-infra';
import { shutdownClickHouse, shutdownDb, shutdownRedis } from '@qurvo/worker-core';
import { COMPUTE_QUEUE_EVENTS } from './tokens';
import { CohortMembershipService } from './cohort-membership.service';

@Injectable()
export class ShutdownService implements OnApplicationShutdown {
  // eslint-disable-next-line max-params -- NestJS DI requires separate constructor params
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(COMPUTE_QUEUE_EVENTS) private readonly queueEvents: QueueEvents,
    @InjectPinoLogger(ShutdownService.name) private readonly logger: PinoLogger,
    private readonly cohortMembershipService: CohortMembershipService,
  ) {}

  async onApplicationShutdown() {
    // stop() awaits in-flight runCycle() including its finally (lock release).
    // Connections must be closed AFTER stop() to ensure lock release succeeds.
    await this.cohortMembershipService
      .stop()
      .catch((err) => this.logger.warn({ err }, 'CohortMembershipService stop failed'));
    await this.queueEvents
      .close()
      .catch((err) => this.logger.warn({ err }, 'QueueEvents close failed'));
    await shutdownClickHouse(this.ch, this.logger);
    await shutdownDb(this.db, this.logger);
    await shutdownRedis(this.redis, this.logger);
  }
}
