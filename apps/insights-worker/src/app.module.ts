import { Module } from '@nestjs/common';
import { workerLoggerModule } from '@qurvo/worker-core';
import { InsightsModule } from './insights/insights.module';

@Module({
  imports: [workerLoggerModule(), InsightsModule],
})
export class AppModule {}
