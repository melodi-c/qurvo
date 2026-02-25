import { Module } from '@nestjs/common';
import { workerLoggerModule } from '@qurvo/worker-core';
import { ProcessorModule } from './processor/processor.module';

@Module({
  imports: [
    workerLoggerModule(),
    ProcessorModule,
  ],
})
export class AppModule {}
