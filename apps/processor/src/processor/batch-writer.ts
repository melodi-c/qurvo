import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { ClickHouseClient, Event } from '@qurvo/clickhouse';
import { CLICKHOUSE } from '@qurvo/nestjs-infra';
import { withRetry } from './retry';
import { PersonBatchStore } from './person-batch-store';
import { DefinitionSyncService } from './definition-sync.service';
import { MetricsService } from './metrics.service';
import { RETRY_CLICKHOUSE } from '../constants';

/**
 * Shared write sequence: flush PG persons → insert to ClickHouse (with retry) → sync definitions (non-critical).
 * Used by both FlushService and DlqService to eliminate duplication of retry config and operation ordering.
 */
@Injectable()
export class BatchWriter {
  constructor(
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    @InjectPinoLogger(BatchWriter.name) private readonly logger: PinoLogger,
    private readonly personBatchStore: PersonBatchStore,
    private readonly definitionSync: DefinitionSyncService,
    private readonly metrics: MetricsService,
  ) {}

  /**
   * Write a batch of events:
   * 1. Flush person batch to PG (critical — failure propagates to caller)
   * 2. Insert events to ClickHouse with retry (critical — failure propagates to caller)
   * 3. Sync definitions (non-critical — errors are logged and swallowed)
   */
  async write(events: Event[]): Promise<void> {
    this.metrics.personBatchQueueSize.set(this.personBatchStore.getPendingCount());
    await this.personBatchStore.flush();
    this.metrics.personBatchQueueSize.set(this.personBatchStore.getPendingCount());

    const stopTimer = this.metrics.flushDuration.startTimer();
    try {
      await withRetry(
        () => this.ch.insert({
          table: 'events',
          values: events,
          format: 'JSONEachRow',
        }),
        'ClickHouse insert',
        this.logger,
        RETRY_CLICKHOUSE,
      );
      stopTimer();
      this.metrics.eventsProcessed.inc(events.length);
    } catch (err) {
      stopTimer();
      this.metrics.eventsFailed.inc({ reason: 'clickhouse_insert' }, events.length);
      throw err;
    }

    try {
      await this.definitionSync.syncFromBatch(events);
    } catch (err) {
      this.logger.warn({ err }, 'Definition sync failed (non-critical)');
    }
  }
}
