import { Module } from '@nestjs/common';
import { workerLoggerModule } from '@qurvo/worker-core';
import { CohortWorkerModule } from './cohort-worker/cohort-worker.module';

@Module({
  imports: [workerLoggerModule(), CohortWorkerModule],
})
export class AppModule {}
