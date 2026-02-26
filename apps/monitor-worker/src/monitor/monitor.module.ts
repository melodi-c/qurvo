import { Module } from '@nestjs/common';
import { DrizzleProvider, ClickHouseProvider } from '@qurvo/nestjs-infra';
import { MonitorService } from './monitor.service';
import { NotificationService } from './notification.service';
import { ShutdownService } from './shutdown.service';

@Module({
  providers: [
    DrizzleProvider,
    ClickHouseProvider,
    NotificationService,
    MonitorService,
    ShutdownService,
  ],
})
export class MonitorModule {}
