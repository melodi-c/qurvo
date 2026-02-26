import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PeriodicWorkerMixin } from '@qurvo/worker-core';
import { eq, isNull } from 'drizzle-orm';
import { projects, aiInsights } from '@qurvo/db';
import type { Database } from '@qurvo/db';
import type { AiInsightType } from '@qurvo/db';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import { DRIZZLE, CLICKHOUSE } from '@qurvo/nestjs-infra';
import {
  INSIGHTS_INTERVAL_MS,
  INSIGHTS_INITIAL_DELAY_MS,
  METRIC_CHANGE_THRESHOLD,
} from '../constants';

interface MetricChangeRow {
  event_name: string;
  count_24h: string;
  avg_7d: string;
  pct_change: string;
}

interface NewEventRow {
  event_name: string;
  first_seen: string;
  count_24h: string;
}

@Injectable()
export class InsightDiscoveryService extends PeriodicWorkerMixin {
  protected readonly intervalMs = INSIGHTS_INTERVAL_MS;
  protected readonly initialDelayMs = INSIGHTS_INITIAL_DELAY_MS;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    @InjectPinoLogger(InsightDiscoveryService.name) protected readonly logger: PinoLogger,
  ) {
    super();
  }

  /** @internal — exposed for integration tests */
  async runCycle(): Promise<void> {
    const allProjects = await this.db.select({ id: projects.id, name: projects.name }).from(projects);

    this.logger.info({ count: allProjects.length }, 'Starting insight discovery cycle');

    for (const project of allProjects) {
      const results = await Promise.allSettled([
        this.detectMetricChanges(project.id, project.name),
        this.detectNewEvents(project.id, project.name),
      ]);

      for (const result of results) {
        if (result.status === 'rejected') {
          this.logger.warn({ err: result.reason, projectId: project.id }, 'Insight detection failed for project');
        }
      }
    }

    this.logger.info({ count: allProjects.length }, 'Insight discovery cycle completed');
  }

  async detectMetricChanges(projectId: string, projectName: string): Promise<void> {
    const query = `
      WITH
        last_24h AS (
          SELECT
            event_name,
            count() AS count_24h
          FROM events
          WHERE
            project_id = {projectId:String}
            AND timestamp >= now() - INTERVAL 1 DAY
          GROUP BY event_name
        ),
        last_7d AS (
          SELECT
            event_name,
            count() / 7.0 AS avg_daily_count
          FROM events
          WHERE
            project_id = {projectId:String}
            AND timestamp >= now() - INTERVAL 7 DAY
            AND timestamp < now() - INTERVAL 1 DAY
          GROUP BY event_name
        )
      SELECT
        l24.event_name AS event_name,
        l24.count_24h AS count_24h,
        l7d.avg_daily_count AS avg_7d,
        (l24.count_24h - l7d.avg_daily_count) / nullIf(l7d.avg_daily_count, 0) AS pct_change
      FROM last_24h l24
      INNER JOIN last_7d l7d ON l24.event_name = l7d.event_name
      WHERE abs(pct_change) > {threshold:Float64}
        AND l7d.avg_daily_count > 10
      ORDER BY abs(pct_change) DESC
      LIMIT 5
    `;

    const result = await this.ch.query({
      query,
      query_params: { projectId, threshold: METRIC_CHANGE_THRESHOLD },
      format: 'JSONEachRow',
    });

    const rows = await result.json<MetricChangeRow>();

    for (const row of rows) {
      const pct = parseFloat(row.pct_change);
      const count24h = parseInt(row.count_24h, 10);
      const avg7d = parseFloat(row.avg_7d);
      const direction = pct > 0 ? 'increased' : 'decreased';
      const pctAbs = Math.abs(Math.round(pct * 100));

      const title = `"${row.event_name}" ${direction} by ${pctAbs}%`;
      const description = `The event "${row.event_name}" had ${count24h} occurrences in the last 24 hours, compared to a 7-day daily average of ${Math.round(avg7d)}. This represents a ${pctAbs}% ${direction === 'increased' ? 'spike' : 'drop'}.`;

      await this.saveInsight(projectId, 'metric_change', title, description, {
        event_name: row.event_name,
        count_24h: count24h,
        avg_7d: avg7d,
        pct_change: pct,
      });
    }
  }

  async detectNewEvents(projectId: string, projectName: string): Promise<void> {
    const query = `
      SELECT
        event_name,
        min(timestamp) AS first_seen,
        count() AS count_24h
      FROM events
      WHERE
        project_id = {projectId:String}
        AND timestamp >= now() - INTERVAL 1 DAY
        AND event_name NOT IN (
          SELECT DISTINCT event_name
          FROM events
          WHERE
            project_id = {projectId:String}
            AND timestamp >= now() - INTERVAL 7 DAY
            AND timestamp < now() - INTERVAL 1 DAY
        )
      GROUP BY event_name
      ORDER BY count_24h DESC
      LIMIT 10
    `;

    const result = await this.ch.query({
      query,
      query_params: { projectId },
      format: 'JSONEachRow',
    });

    const rows = await result.json<NewEventRow>();

    for (const row of rows) {
      const count = parseInt(row.count_24h, 10);
      const title = `New event detected: "${row.event_name}"`;
      const description = `A new event "${row.event_name}" appeared for the first time in the last 24 hours with ${count} occurrences. This event was not seen in the previous 7 days.`;

      await this.saveInsight(projectId, 'new_event', title, description, {
        event_name: row.event_name,
        first_seen: row.first_seen,
        count_24h: count,
      });
    }
  }

  private async saveInsight(
    projectId: string,
    type: AiInsightType,
    title: string,
    description: string,
    dataJson: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(aiInsights).values({
      project_id: projectId,
      type,
      title,
      description,
      data_json: dataJson,
    });

    this.logger.debug({ projectId, type, title }, 'Insight saved');
  }
}
