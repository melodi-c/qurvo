import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import Redis from 'ioredis';
import { type ClickHouseClient } from '@qurvo/clickhouse';
import { REDIS } from '../providers/redis.provider';
import { CLICKHOUSE } from '../providers/clickhouse.provider';
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
    this.cohortMembershipService.stop();
    await this.ch.close().catch(() => {});
    await this.redis.quit().catch(() => {});
  }
}
