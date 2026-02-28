import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { ClickHouseClient, IngestionWarning } from '@qurvo/clickhouse';
import { CLICKHOUSE } from '@qurvo/nestjs-infra';
import { WARNINGS_BATCH_SIZE, WARNINGS_FLUSH_INTERVAL_MS } from '../constants';
import { createScheduledLoop } from './schedule-loop';

@Injectable()
export class WarningsBufferService implements OnApplicationBootstrap {
  private buffer: IngestionWarning[] = [];
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    @InjectPinoLogger(WarningsBufferService.name) private readonly logger: PinoLogger,
  ) {}

  private readonly loop = createScheduledLoop(
    () => this.flush(),
    WARNINGS_FLUSH_INTERVAL_MS,
    (err) => this.logger.warn({ err }, 'Scheduled warnings flush error'),
  );

  onApplicationBootstrap() {
    this.flushTimer = this.loop.start();
  }

  addWarning(warning: IngestionWarning): void {
    this.buffer.push(warning);
    if (this.buffer.length >= WARNINGS_BATCH_SIZE) {
      void this.flush();
    }
  }

  async shutdown(): Promise<void> {
    this.loop.stop();
    if (this.flushTimer) {clearTimeout(this.flushTimer);}
    await this.flush();
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) {return;}
    const batch = this.buffer.splice(0);
    try {
      await this.ch.insert({
        table: 'ingestion_warnings',
        values: batch,
        format: 'JSONEachRow',
      });
      this.logger.debug({ count: batch.length }, 'Flushed ingestion warnings to ClickHouse');
    } catch (err) {
      this.logger.warn({ err, count: batch.length }, 'Failed to flush ingestion warnings — dropping batch');
    }
  }

}
