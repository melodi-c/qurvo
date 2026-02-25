import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import Redis from 'ioredis';
import { type ClickHouseClient } from '@qurvo/clickhouse';
import { type Database } from '@qurvo/db';
import { REDIS, CLICKHOUSE, DRIZZLE } from '@qurvo/nestjs-infra';
import { CohortMembershipService } from './cohort-membership.service';

@Injectable()
export class ShutdownService implements OnApplicationShutdown {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    @Inject(DRIZZLE) private readonly db: Database,
    @InjectPinoLogger(ShutdownService.name) private readonly logger: PinoLogger,
    private readonly cohortMembershipService: CohortMembershipService,
  ) {}

  async onApplicationShutdown() {
    // stop() awaits in-flight runCycle() including its finally (lock release).
    // Connections must be closed AFTER stop() to ensure lock release succeeds.
    await this.cohortMembershipService
      .stop()
      .catch((err) => this.logger.warn({ err }, 'CohortMembershipService stop failed'));
    await this.ch.close().catch((err) =>
      this.logger.warn({ err }, 'ClickHouse close failed'),
    );
    await this.db.$pool.end().catch((err) =>
      this.logger.warn({ err }, 'PostgreSQL pool close failed'),
    );
    await this.redis.quit().catch((err) =>
      this.logger.warn({ err }, 'Redis quit failed'),
    );
  }
}
