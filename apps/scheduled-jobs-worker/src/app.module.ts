import { Module } from '@nestjs/common';
import { workerLoggerModule } from '@qurvo/worker-core';
import { ScheduledJobsModule } from './scheduled-jobs/scheduled-jobs.module';

@Module({
  imports: [workerLoggerModule(), ScheduledJobsModule],
})
export class AppModule {}
