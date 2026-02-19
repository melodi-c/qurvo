import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { IngestController } from './ingest.controller';
import { IngestService } from './ingest.service';
import { ZodExceptionFilter } from '../filters/zod-exception.filter';

@Module({
  controllers: [IngestController],
  providers: [
    IngestService,
    { provide: APP_FILTER, useClass: ZodExceptionFilter },
  ],
})
export class IngestModule {}
