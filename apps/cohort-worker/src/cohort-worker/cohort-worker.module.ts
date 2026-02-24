import { Module, type Provider } from '@nestjs/common';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { RedisProvider, ClickHouseProvider, DrizzleProvider, REDIS } from '@qurvo/nestjs-infra';
import { DistributedLock } from '@qurvo/distributed-lock';
import { DISTRIBUTED_LOCK, COHORT_LOCK_KEY, COHORT_LOCK_TTL_SECONDS } from '../constants';
import { CohortComputationService } from './cohort-computation.service';
import { CohortMembershipService } from './cohort-membership.service';
import { ShutdownService } from './shutdown.service';

const DistributedLockProvider: Provider = {
  provide: DISTRIBUTED_LOCK,
  inject: [REDIS],
  useFactory: (redis: Redis) =>
    new DistributedLock(redis, COHORT_LOCK_KEY, randomUUID(), COHORT_LOCK_TTL_SECONDS),
};

@Module({
  providers: [
    RedisProvider,
    ClickHouseProvider,
    DrizzleProvider,
    DistributedLockProvider,
    CohortComputationService,
    CohortMembershipService,
    ShutdownService,
  ],
})
export class CohortWorkerModule {}
