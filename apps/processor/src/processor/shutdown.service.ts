import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import Redis from 'ioredis';
import { type ClickHouseClient } from '@qurvo/clickhouse';
import { REDIS, CLICKHOUSE } from '@qurvo/nestjs-infra';
import { FlushService } from './flush.service';
import { DlqService } from './dlq.service';
import { EventConsumerService } from './event-consumer.service';
import { WarningsBufferService } from './warnings-buffer.service';

@Injectable()
export class ShutdownService implements OnApplicationShutdown {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    @InjectPinoLogger(ShutdownService.name) private readonly logger: PinoLogger,
    private readonly eventConsumerService: EventConsumerService,
    private readonly flushService: FlushService,
    private readonly dlqService: DlqService,
    private readonly warningsBuffer: WarningsBufferService,
  ) {}

  async onApplicationShutdown() {
    let hasCriticalError = false;

    await this.eventConsumerService.shutdown().catch((err) => {
      this.logger.error({ err }, 'Consumer shutdown error');
      hasCriticalError = true;
    });
    await this.dlqService.stop().catch((err) =>
      this.logger.error({ err }, 'DLQ shutdown error'),
    );
    // FlushService.shutdown() runs a final flush which includes personBatchStore.flush() internally
    await this.flushService.shutdown().catch((err) => {
      this.logger.error({ err }, 'Flush shutdown error');
      hasCriticalError = true;
    });
    await this.warningsBuffer.shutdown().catch((err) =>
      this.logger.warn({ err }, 'Warnings buffer shutdown error'),
    );
    await this.ch.close().catch(() => {});
    await this.redis.quit().catch(() => {});

    if (hasCriticalError) {
      setTimeout(() => process.exit(1), 100);
    }
  }
}
