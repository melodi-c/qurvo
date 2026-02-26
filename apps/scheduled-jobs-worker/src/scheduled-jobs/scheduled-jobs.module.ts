import { Module } from '@nestjs/common';
import { DrizzleProvider } from '@qurvo/nestjs-infra';
import { ScheduledJobsService } from './scheduled-jobs.service';
import { NotificationService } from './notification.service';
import { ShutdownService } from './shutdown.service';

@Module({
  providers: [
    DrizzleProvider,
    NotificationService,
    ScheduledJobsService,
    ShutdownService,
  ],
})
export class ScheduledJobsModule {}
