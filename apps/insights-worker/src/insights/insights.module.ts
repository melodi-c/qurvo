import { Module } from '@nestjs/common';
import { DrizzleProvider, ClickHouseProvider } from '@qurvo/nestjs-infra';
import { InsightDiscoveryService } from './insight-discovery.service';
import { ShutdownService } from './shutdown.service';

@Module({
  providers: [
    DrizzleProvider,
    ClickHouseProvider,
    InsightDiscoveryService,
    ShutdownService,
  ],
})
export class InsightsModule {}
