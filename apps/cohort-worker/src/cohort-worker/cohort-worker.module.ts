import { Module, type Provider } from '@nestjs/common';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { BullModule } from '@nestjs/bullmq';
import { QueueEvents } from 'bullmq';
import { RedisProvider, ClickHouseProvider, DrizzleProvider, REDIS } from '@qurvo/nestjs-infra';
import { DistributedLock } from '@qurvo/distributed-lock';
import {
  COHORT_LOCK_KEY,
  COHORT_LOCK_TTL_SECONDS,
  COHORT_COMPUTE_QUEUE,
} from '../constants';
import { DISTRIBUTED_LOCK, COMPUTE_QUEUE_EVENTS } from './tokens';
import { CohortComputationService } from './cohort-computation.service';
import { CohortMembershipService } from './cohort-membership.service';
import { CohortComputeProcessor } from './cohort-compute.processor';
import { MetricsService } from './metrics.service';
import { ShutdownService } from './shutdown.service';

function parseRedisUrl(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname || 'localhost',
    port: parseInt(u.port || '6379'),
    ...(u.password ? { password: u.password } : {}),
    ...(u.pathname && u.pathname.length > 1 ? { db: parseInt(u.pathname.slice(1)) } : {}),
  };
}

const DistributedLockProvider: Provider = {
  provide: DISTRIBUTED_LOCK,
  inject: [REDIS],
  useFactory: (redis: Redis) =>
    new DistributedLock(redis, COHORT_LOCK_KEY, randomUUID(), COHORT_LOCK_TTL_SECONDS),
};

const ComputeQueueEventsProvider: Provider = {
  provide: COMPUTE_QUEUE_EVENTS,
  useFactory: () =>
    new QueueEvents(COHORT_COMPUTE_QUEUE, {
      connection: parseRedisUrl(process.env.REDIS_URL!),
    }),
};

@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: () => ({
        connection: parseRedisUrl(process.env.REDIS_URL!),
      }),
    }),
    BullModule.registerQueue({ name: COHORT_COMPUTE_QUEUE }),
  ],
  providers: [
    RedisProvider,
    ClickHouseProvider,
    DrizzleProvider,
    DistributedLockProvider,
    ComputeQueueEventsProvider,
    CohortComputationService,
    CohortMembershipService,
    CohortComputeProcessor,
    MetricsService,
    ShutdownService,
  ],
})
export class CohortWorkerModule {}
