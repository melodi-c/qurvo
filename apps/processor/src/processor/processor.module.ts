import { Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import { type ClickHouseClient } from '@qurvo/clickhouse';
import { RedisProvider, REDIS } from '../providers/redis.provider';
import { ClickHouseProvider, CLICKHOUSE } from '../providers/clickhouse.provider';
import { DrizzleProvider } from '../providers/drizzle.provider';
import { FlushService } from './flush.service';
import { DlqService } from './dlq.service';
import { CohortMembershipService } from './cohort-membership.service';
import { EventConsumerService } from './event-consumer.service';
import { EventEnrichmentService } from './event-enrichment.service';
import { HeartbeatService } from './heartbeat.service';
import { PersonResolverService } from './person-resolver.service';
import { PersonWriterService } from './person-writer.service';
import { PERSON_WRITER } from './person-writer.interface';
import { PersonBatchStore } from './person-batch-store';
import { GeoService } from './geo.service';
import { DefinitionSyncService } from './definition-sync.service';

@Module({
  providers: [
    RedisProvider,
    ClickHouseProvider,
    DrizzleProvider,
    DefinitionSyncService,
    FlushService,
    DlqService,
    CohortMembershipService,
    PersonResolverService,
    PersonWriterService,
    { provide: PERSON_WRITER, useExisting: PersonWriterService },
    PersonBatchStore,
    GeoService,
    EventEnrichmentService,
    HeartbeatService,
    EventConsumerService,
  ],
})
export class ProcessorModule implements OnApplicationShutdown {
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
