import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { ClickHouseClient, Event } from '@qurvo/clickhouse';
import { CLICKHOUSE } from '@qurvo/nestjs-infra';
import { withRetry } from './retry';
import { PersonBatchStore } from './person-batch-store';
import { DefinitionSyncService } from './definition-sync.service';
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
  ) {}

  /**
   * Write a batch of events:
   * 1. Flush person batch to PG (critical — failure propagates to caller)
   * 2. Insert events to ClickHouse with retry (critical — failure propagates to caller)
   * 3. Sync definitions (non-critical — errors are logged and swallowed)
   */
  async write(events: Event[]): Promise<void> {
    await this.personBatchStore.flush();

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

    try {
      await this.definitionSync.syncFromBatch(events);
    } catch (err) {
      this.logger.warn({ err }, 'Definition sync failed (non-critical)');
    }
  }
}
