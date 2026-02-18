import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { IngestController } from './ingest.controller';
import { IngestService } from './ingest.service';
import { RedisProvider } from '../providers/redis.provider';
import { DrizzleProvider } from '../providers/drizzle.provider';
import { ZodExceptionFilter } from '../filters/zod-exception.filter';

@Module({
  controllers: [IngestController],
  providers: [
    IngestService,
    RedisProvider,
    DrizzleProvider,
    { provide: APP_FILTER, useClass: ZodExceptionFilter },
  ],
})
export class IngestModule {}
