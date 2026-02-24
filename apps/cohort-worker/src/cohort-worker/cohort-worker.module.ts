import { Module } from '@nestjs/common';
import { RedisProvider, ClickHouseProvider, DrizzleProvider } from '@qurvo/nestjs-infra';
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
