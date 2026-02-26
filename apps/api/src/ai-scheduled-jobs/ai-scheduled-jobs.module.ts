import { Module } from '@nestjs/common';
import { AiScheduledJobsService } from './ai-scheduled-jobs.service';

@Module({
  providers: [AiScheduledJobsService],
  exports: [AiScheduledJobsService],
})
export class AiScheduledJobsModule {}
