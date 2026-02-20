import { Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import { type ClickHouseClient } from '@qurvo/clickhouse';
import { RedisProvider, REDIS } from '../providers/redis.provider';
import { ClickHouseProvider, CLICKHOUSE } from '../providers/clickhouse.provider';
import { DrizzleProvider } from '../providers/drizzle.provider';
import { FlushService } from './flush.service';
import { DlqService } from './dlq.service';
import { EventConsumerService } from './event-consumer.service';
import { PersonResolverService } from './person-resolver.service';
import { PersonWriterService } from './person-writer.service';

@Module({
  providers: [
    RedisProvider,
    ClickHouseProvider,
    DrizzleProvider,
    FlushService,
    DlqService,
    PersonResolverService,
    PersonWriterService,
    EventConsumerService,
  ],
})
export class ProcessorModule implements OnApplicationShutdown {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    private readonly eventConsumerService: EventConsumerService,
    private readonly flushService: FlushService,
    private readonly dlqService: DlqService,
  ) {}

  async onApplicationShutdown() {
    await this.eventConsumerService.shutdown();
    this.dlqService.stop();
    this.flushService.stopTimer();
    await this.flushService.flush();
    await this.ch.close();
    await this.redis.quit();
  }
}
