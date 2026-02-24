import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import Redis from 'ioredis';
import { type ClickHouseClient } from '@qurvo/clickhouse';
import { REDIS, CLICKHOUSE } from '@qurvo/nestjs-infra';
import { CohortMembershipService } from './cohort-membership.service';

@Injectable()
export class ShutdownService implements OnApplicationShutdown {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    @InjectPinoLogger(ShutdownService.name) private readonly logger: PinoLogger,
    private readonly cohortMembershipService: CohortMembershipService,
  ) {}

  async onApplicationShutdown() {
    // stop() awaits in-flight runCycle() including its finally (lock release).
    // Redis/CH must be closed AFTER stop() to ensure lock release succeeds.
    await this.cohortMembershipService
      .stop()
      .catch((err) => this.logger.warn({ err }, 'CohortMembershipService stop failed'));
    await this.ch.close().catch((err) =>
      this.logger.warn({ err }, 'ClickHouse close failed'),
    );
    await this.redis.quit().catch((err) =>
      this.logger.warn({ err }, 'Redis quit failed'),
    );
  }
}
