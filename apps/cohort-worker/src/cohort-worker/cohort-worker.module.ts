import { Module } from '@nestjs/common';
import { RedisProvider } from '../providers/redis.provider';
import { ClickHouseProvider } from '../providers/clickhouse.provider';
import { DrizzleProvider } from '../providers/drizzle.provider';
import { CohortMembershipService } from './cohort-membership.service';
import { ShutdownService } from './shutdown.service';

@Module({
  providers: [
    RedisProvider,
    ClickHouseProvider,
    DrizzleProvider,
    CohortMembershipService,
    ShutdownService,
  ],
})
export class CohortWorkerModule {}
