import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import Redis from 'ioredis';
import { type ClickHouseClient } from '@qurvo/clickhouse';
import { REDIS } from '../providers/redis.provider';
import { CLICKHOUSE } from '../providers/clickhouse.provider';
import { FlushService } from './flush.service';
import { DlqService } from './dlq.service';
import { EventConsumerService } from './event-consumer.service';
import { PersonBatchStore } from './person-batch-store';

@Injectable()
export class ShutdownService implements OnApplicationShutdown {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    @InjectPinoLogger(ShutdownService.name) private readonly logger: PinoLogger,
    private readonly eventConsumerService: EventConsumerService,
    private readonly flushService: FlushService,
    private readonly dlqService: DlqService,
    private readonly personBatchStore: PersonBatchStore,
  ) {}

  async onApplicationShutdown() {
    await this.eventConsumerService.shutdown().catch((err) =>
      this.logger.error({ err }, 'Consumer shutdown error'),
    );
    this.dlqService.stop();
    await this.flushService.shutdown().catch((err) =>
      this.logger.error({ err }, 'Flush shutdown error'),
    );
    await this.personBatchStore.flush().catch((err) =>
      this.logger.error({ err }, 'PersonBatchStore final flush error'),
    );
    await this.ch.close().catch(() => {});
    await this.redis.quit().catch(() => {});
  }
}
