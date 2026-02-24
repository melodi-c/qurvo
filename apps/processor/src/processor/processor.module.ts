import { Module } from '@nestjs/common';
import { RedisProvider } from '../providers/redis.provider';
import { ClickHouseProvider } from '../providers/clickhouse.provider';
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
import { ShutdownService } from './shutdown.service';

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
    ShutdownService,
  ],
})
export class ProcessorModule {}
