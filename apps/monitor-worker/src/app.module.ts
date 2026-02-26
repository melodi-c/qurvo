import { Module } from '@nestjs/common';
import { workerLoggerModule } from '@qurvo/worker-core';
import { MonitorModule } from './monitor/monitor.module';

@Module({
  imports: [workerLoggerModule(), MonitorModule],
})
export class AppModule {}
