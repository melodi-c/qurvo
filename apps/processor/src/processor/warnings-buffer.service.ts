import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { ClickHouseClient, IngestionWarning } from '@qurvo/clickhouse';
import { CLICKHOUSE } from '@qurvo/nestjs-infra';
import { WARNINGS_BATCH_SIZE, WARNINGS_FLUSH_INTERVAL_MS } from '../constants';

@Injectable()
export class WarningsBufferService implements OnApplicationBootstrap {
  private buffer: IngestionWarning[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    @InjectPinoLogger(WarningsBufferService.name) private readonly logger: PinoLogger,
  ) {}

  onApplicationBootstrap() {
    this.scheduleFlush();
  }

  addWarning(warning: IngestionWarning): void {
    this.buffer.push(warning);
    if (this.buffer.length >= WARNINGS_BATCH_SIZE) {
      void this.flush();
    }
  }

  async shutdown(): Promise<void> {
    this.stopped = true;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    await this.flush();
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
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

  private scheduleFlush() {
    this.flushTimer = setTimeout(async () => {
      try {
        await this.flush();
      } catch (err) {
        this.logger.warn({ err }, 'Scheduled warnings flush error');
      }
      if (!this.stopped) this.scheduleFlush();
    }, WARNINGS_FLUSH_INTERVAL_MS);
  }
}
