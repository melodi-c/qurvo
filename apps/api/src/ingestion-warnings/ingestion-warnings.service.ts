import { Injectable, Inject } from '@nestjs/common';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import { CLICKHOUSE } from '../providers/clickhouse.provider';

export interface IngestionWarningRow {
  project_id: string;
  type: string;
  details: string;
  timestamp: string;
}

@Injectable()
export class IngestionWarningsService {
  constructor(
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
  ) {}

  async getWarnings(projectId: string, limit: number): Promise<IngestionWarningRow[]> {
    const rs = await this.ch.query({
      query: `
        SELECT
          project_id,
          type,
          details,
          timestamp
        FROM ingestion_warnings
        WHERE project_id = {project_id: UUID}
        ORDER BY timestamp DESC
        LIMIT {limit: UInt32}
      `,
      query_params: { project_id: projectId, limit },
      format: 'JSONEachRow',
    });
    return rs.json<IngestionWarningRow>();
  }
}
