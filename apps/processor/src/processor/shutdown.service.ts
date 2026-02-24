import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import { type ClickHouseClient } from '@qurvo/clickhouse';
import { REDIS } from '../providers/redis.provider';
import { CLICKHOUSE } from '../providers/clickhouse.provider';
import { FlushService } from './flush.service';
import { DlqService } from './dlq.service';
import { CohortMembershipService } from './cohort-membership.service';
import { EventConsumerService } from './event-consumer.service';

@Injectable()
export class ShutdownService implements OnApplicationShutdown {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    private readonly eventConsumerService: EventConsumerService,
    private readonly flushService: FlushService,
    private readonly dlqService: DlqService,
    private readonly cohortMembershipService: CohortMembershipService,
  ) {}

  async onApplicationShutdown() {
    await this.eventConsumerService.shutdown();
    this.dlqService.stop();
    this.cohortMembershipService.stop();
    this.flushService.stopTimer();
    await this.flushService.flush();
    await this.ch.close();
    await this.redis.quit();
  }
}
