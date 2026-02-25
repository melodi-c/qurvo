import { Module } from '@nestjs/common';
import { RedisProvider, ClickHouseProvider, DrizzleProvider } from '@qurvo/nestjs-infra';
import { FlushService } from './flush.service';
import { DlqService } from './dlq.service';
import { EventConsumerService } from './event-consumer.service';
import { PersonResolverService } from './person-resolver.service';
import { PersonBatchStore } from './person-batch-store';
import { GeoService } from './geo.service';
import { DefinitionSyncService } from './definition-sync.service';
import { BatchWriter } from './batch-writer';
import { ShutdownService } from './shutdown.service';
import { WarningsBufferService } from './warnings-buffer.service';
import { MetricsService } from './metrics.service';

@Module({
  providers: [
    RedisProvider,
    ClickHouseProvider,
    DrizzleProvider,
    MetricsService,
    DefinitionSyncService,
    BatchWriter,
    FlushService,
    DlqService,
    PersonResolverService,
    PersonBatchStore,
    GeoService,
    WarningsBufferService,
    EventConsumerService,
    ShutdownService,
  ],
})
export class ProcessorModule {}
