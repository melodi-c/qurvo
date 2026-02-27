import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PeriodicWorkerMixin } from '@qurvo/worker-core';
import { Heartbeat } from '@qurvo/heartbeat';
import { projects, aiInsights } from '@qurvo/db';
import type { Database } from '@qurvo/db';
import type { AiInsightType } from '@qurvo/db';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import { DRIZZLE, CLICKHOUSE } from '@qurvo/nestjs-infra';
import {
  INSIGHTS_INTERVAL_MS,
  INSIGHTS_INITIAL_DELAY_MS,
  METRIC_CHANGE_THRESHOLD,
  RETENTION_ANOMALY_THRESHOLD,
  CONVERSION_CORRELATION_LIFT_THRESHOLD,
  CONVERSION_CORRELATION_MIN_SAMPLE,
  HEARTBEAT_PATH,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_LOOP_STALE_MS,
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

interface RetentionAnomalyRow {
  event_name: string;
  current_cohort_size: string;
  current_retained: string;
  current_retention_rate: string;
  prev_cohort_size: string;
  prev_retained: string;
  prev_retention_rate: string;
  retention_drop: string;
}

interface ConversionCorrelationRow {
  conversion_event: string;
  intermediate_event: string;
  total_users: string;
  converters: string;
  intermediate_and_converted: string;
  intermediate_users: string;
  base_conversion_rate: string;
  conditional_conversion_rate: string;
  relative_lift: string;
}

@Injectable()
export class InsightDiscoveryService extends PeriodicWorkerMixin implements OnApplicationBootstrap {
  protected readonly intervalMs = INSIGHTS_INTERVAL_MS;
  protected readonly initialDelayMs = INSIGHTS_INITIAL_DELAY_MS;
  private readonly heartbeat: Heartbeat;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    @InjectPinoLogger(InsightDiscoveryService.name) protected readonly logger: PinoLogger,
  ) {
    super();
    this.heartbeat = new Heartbeat({
      path: HEARTBEAT_PATH,
      intervalMs: HEARTBEAT_INTERVAL_MS,
      staleMs: HEARTBEAT_LOOP_STALE_MS,
      onStale: (loopAge) => this.logger.warn({ loopAge }, 'Insights-worker loop stale, skipping heartbeat'),
    });
  }

  override onApplicationBootstrap() {
    super.onApplicationBootstrap();
    this.heartbeat.start();
  }

  override async stop(): Promise<void> {
    await super.stop();
    this.heartbeat.stop();
  }

  /** @internal — exposed for integration tests */
  async runCycle(): Promise<void> {
    this.heartbeat.touch();
    const allProjects = await this.db.select({ id: projects.id }).from(projects);

    this.logger.info({ count: allProjects.length }, 'Starting insight discovery cycle');

    for (const project of allProjects) {
      const results = await Promise.allSettled([
        this.detectMetricChanges(project.id),
        this.detectNewEvents(project.id),
        this.detectRetentionAnomalies(project.id),
        this.detectConversionCorrelations(project.id),
      ]);

      for (const result of results) {
        if (result.status === 'rejected') {
          this.logger.warn({ err: result.reason, projectId: project.id }, 'Insight detection failed for project');
        }
      }
    }

    this.logger.info({ count: allProjects.length }, 'Insight discovery cycle completed');
  }

  async detectMetricChanges(projectId: string): Promise<void> {
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

  async detectNewEvents(projectId: string): Promise<void> {
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

  /**
   * Detect week-1 retention anomalies by comparing this week's day-0 cohort to last week's.
   * Reports events where retention dropped >20% week-over-week.
   * A user is "retained" if they performed the same event again 7+ days after their first occurrence.
   *
   * ClickHouse does NOT support correlated subqueries (outer column refs inside subquery WHERE).
   * We use INNER JOIN between cohort and return-events CTEs to avoid this limitation.
   *
   * The current cohort excludes users who were already in prev_cohort — this ensures the two
   * cohorts are disjoint and prevents prev-retained users (whose return events fall in the
   * current_cohort time window) from inflating current_cohort_size.
   */
  async detectRetentionAnomalies(projectId: string): Promise<void> {
    // Cohort windows:
    //   current cohort (day-0): users who did event X 14-7 days ago, NOT seen 21-14 days ago
    //   prev cohort (day-0):    users who did event X 21-14 days ago
    //
    // Return windows:
    //   current return:  events in last 7 days (after current cohort window)
    //   prev return:     events 14-7 days ago (after prev cohort window)
    //
    // prev_return and current_cohort share the same time window. Without exclusion,
    // prev-retained users who appear in prev_return also contaminate current_cohort.
    // Excluding prev_cohort members from current_cohort fixes this.
    //
    // We INNER JOIN cohort with return-events on (event_name, distinct_id) — ClickHouse
    // does NOT support correlated subqueries with outer CTE column references.
    const query = `
      WITH
        prev_cohort AS (
          SELECT
            event_name,
            distinct_id
          FROM events
          WHERE
            project_id = {projectId:String}
            AND timestamp >= now() - INTERVAL 21 DAY
            AND timestamp < now() - INTERVAL 14 DAY
          GROUP BY event_name, distinct_id
        ),
        prev_return AS (
          SELECT
            event_name,
            distinct_id
          FROM events
          WHERE
            project_id = {projectId:String}
            AND timestamp >= now() - INTERVAL 14 DAY
            AND timestamp < now() - INTERVAL 7 DAY
          GROUP BY event_name, distinct_id
        ),
        prev_cohort_size AS (
          SELECT event_name, count() AS cohort_size
          FROM prev_cohort
          GROUP BY event_name
        ),
        prev_retained AS (
          SELECT pc.event_name, count() AS retained_count
          FROM prev_cohort pc
          INNER JOIN prev_return pr ON pc.event_name = pr.event_name AND pc.distinct_id = pr.distinct_id
          GROUP BY pc.event_name
        ),
        current_cohort_raw AS (
          SELECT
            event_name,
            distinct_id
          FROM events
          WHERE
            project_id = {projectId:String}
            AND timestamp >= now() - INTERVAL 14 DAY
            AND timestamp < now() - INTERVAL 7 DAY
          GROUP BY event_name, distinct_id
        ),
        current_cohort AS (
          SELECT event_name, distinct_id
          FROM current_cohort_raw
          WHERE (event_name, distinct_id) NOT IN (SELECT event_name, distinct_id FROM prev_cohort)
        ),
        current_return AS (
          SELECT
            event_name,
            distinct_id
          FROM events
          WHERE
            project_id = {projectId:String}
            AND timestamp >= now() - INTERVAL 7 DAY
          GROUP BY event_name, distinct_id
        ),
        current_cohort_size AS (
          SELECT event_name, count() AS cohort_size
          FROM current_cohort
          GROUP BY event_name
        ),
        current_retained AS (
          SELECT cc.event_name, count() AS retained_count
          FROM current_cohort cc
          INNER JOIN current_return cr ON cc.event_name = cr.event_name AND cc.distinct_id = cr.distinct_id
          GROUP BY cc.event_name
        )
      SELECT
        cs.event_name AS event_name,
        cs.cohort_size AS current_cohort_size,
        coalesce(cr.retained_count, 0) AS current_retained,
        coalesce(cr.retained_count, 0) / nullIf(cs.cohort_size, 0) AS current_retention_rate,
        ps.cohort_size AS prev_cohort_size,
        coalesce(pr.retained_count, 0) AS prev_retained,
        coalesce(pr.retained_count, 0) / nullIf(ps.cohort_size, 0) AS prev_retention_rate,
        (coalesce(pr.retained_count, 0) / nullIf(ps.cohort_size, 0)) - (coalesce(cr.retained_count, 0) / nullIf(cs.cohort_size, 0)) AS retention_drop
      FROM current_cohort_size cs
      INNER JOIN prev_cohort_size ps ON cs.event_name = ps.event_name
      LEFT JOIN current_retained cr ON cs.event_name = cr.event_name
      LEFT JOIN prev_retained pr ON cs.event_name = pr.event_name
      WHERE
        retention_drop > {threshold:Float64}
        AND cs.cohort_size >= 10
        AND ps.cohort_size >= 10
      ORDER BY retention_drop DESC
      LIMIT 5
    `;

    const result = await this.ch.query({
      query,
      query_params: { projectId, threshold: RETENTION_ANOMALY_THRESHOLD },
      format: 'JSONEachRow',
    });

    const rows = await result.json<RetentionAnomalyRow>();

    for (const row of rows) {
      const currentRate = parseFloat(row.current_retention_rate);
      const prevRate = parseFloat(row.prev_retention_rate);
      const drop = parseFloat(row.retention_drop);
      const dropPct = Math.round(drop * 100);
      const currentPct = Math.round(currentRate * 100);
      const prevPct = Math.round(prevRate * 100);

      const title = `Retention drop for "${row.event_name}": ${prevPct}% → ${currentPct}%`;
      const description = `Week-1 retention for "${row.event_name}" dropped by ${dropPct} percentage points this week (${prevPct}% last week vs ${currentPct}% this week). Current cohort: ${row.current_cohort_size} users, previous cohort: ${row.prev_cohort_size} users.`;

      await this.saveInsight(projectId, 'retention_anomaly', title, description, {
        event_name: row.event_name,
        current_cohort_size: parseInt(row.current_cohort_size, 10),
        current_retained: parseInt(row.current_retained, 10),
        current_retention_rate: currentRate,
        prev_cohort_size: parseInt(row.prev_cohort_size, 10),
        prev_retained: parseInt(row.prev_retained, 10),
        prev_retention_rate: prevRate,
        retention_drop: drop,
      });
    }
  }

  /**
   * Detect conversion correlations: for the top-5 events by frequency, find intermediate events
   * that correlate with significantly higher conversion rates (relative lift > 50%).
   * Only reports insights where the intermediate event was seen by >= 30 users.
   *
   * Replaces the previous N+1 pattern (1 query for top events + 1 query per top event)
   * with a single query that computes correlations for all top events at once via
   * GROUP BY (conversion_event, intermediate_event).
   *
   * ClickHouse quirks applied here:
   *   - CTEs are NOT materialised (inlined like views). Each CTE is referenced only once
   *     to avoid unnecessary re-scans.
   *   - LEFT JOIN + IS NOT NULL does NOT work for non-Nullable columns — ClickHouse returns
   *     default values (e.g. empty string) instead of NULL for unmatched rows.
   *     We use INNER JOIN on distinct_id between conv_users and inter_users to collect
   *     co-occurrence counts, then separately aggregate conv_counts and inter_counts.
   *   - `LIMIT n BY key` returns up to n rows per key, which gives top-3 correlations
   *     per conversion event in a single pass.
   */
  async detectConversionCorrelations(projectId: string): Promise<void> {
    const correlationQuery = `
      WITH
        -- Top-5 conversion events by total count in the last 30 days.
        -- Referenced only in conv_users (one IN sub-select) to avoid re-scan.
        top_events AS (
          SELECT event_name
          FROM events
          WHERE
            project_id = {projectId:String}
            AND timestamp >= now() - INTERVAL 30 DAY
          GROUP BY event_name
          ORDER BY count() DESC
          LIMIT 5
        ),
        -- One row per (conversion_event, distinct_id) for top-5 events.
        conv_users AS (
          SELECT
            event_name AS conversion_event,
            distinct_id
          FROM events
          WHERE
            project_id = {projectId:String}
            AND event_name IN (SELECT event_name FROM top_events)
            AND timestamp >= now() - INTERVAL 30 DAY
          GROUP BY event_name, distinct_id
        ),
        -- Total converters per conversion event (needed for base_rate denominator).
        conv_counts AS (
          SELECT conversion_event, count() AS converters
          FROM conv_users
          GROUP BY conversion_event
        ),
        -- One row per (intermediate_event, distinct_id) for all events.
        inter_users AS (
          SELECT
            event_name AS intermediate_event,
            distinct_id
          FROM events
          WHERE
            project_id = {projectId:String}
            AND timestamp >= now() - INTERVAL 30 DAY
          GROUP BY event_name, distinct_id
        ),
        -- Total intermediate users per event (needed for conditional_rate denominator).
        inter_counts AS (
          SELECT intermediate_event, count() AS intermediate_users
          FROM inter_users
          GROUP BY intermediate_event
        ),
        -- Pairs where the same user performed both a conversion event and an intermediate event.
        -- INNER JOIN correctly excludes users who did only one of the two events.
        both_users AS (
          SELECT
            cu.conversion_event AS conversion_event,
            iu.intermediate_event AS intermediate_event,
            count() AS intermediate_and_converted
          FROM conv_users cu
          INNER JOIN inter_users iu ON cu.distinct_id = iu.distinct_id
          WHERE cu.conversion_event != iu.intermediate_event
          GROUP BY cu.conversion_event, iu.intermediate_event
        ),
        -- Total distinct users in the project window (single scalar row for CROSS JOIN).
        total_users_agg AS (
          SELECT count(DISTINCT distinct_id) AS total_users
          FROM events
          WHERE
            project_id = {projectId:String}
            AND timestamp >= now() - INTERVAL 30 DAY
        )
      SELECT
        bu.conversion_event AS conversion_event,
        bu.intermediate_event AS intermediate_event,
        tu.total_users AS total_users,
        cc.converters AS converters,
        bu.intermediate_and_converted AS intermediate_and_converted,
        ic.intermediate_users AS intermediate_users,
        cc.converters / nullIf(tu.total_users, 0) AS base_conversion_rate,
        bu.intermediate_and_converted / nullIf(ic.intermediate_users, 0) AS conditional_conversion_rate,
        bu.intermediate_and_converted / nullIf(ic.intermediate_users, 0) /
          nullIf(cc.converters / nullIf(tu.total_users, 0), 0) - 1 AS relative_lift
      FROM both_users bu
      INNER JOIN conv_counts cc ON bu.conversion_event = cc.conversion_event
      INNER JOIN inter_counts ic ON bu.intermediate_event = ic.intermediate_event
      CROSS JOIN total_users_agg tu
      HAVING
        ic.intermediate_users >= {minSample:UInt64}
        AND relative_lift > {liftThreshold:Float64}
      ORDER BY bu.conversion_event, relative_lift DESC
      LIMIT 3 BY bu.conversion_event
    `;

    const correlationResult = await this.ch.query({
      query: correlationQuery,
      query_params: {
        projectId,
        minSample: CONVERSION_CORRELATION_MIN_SAMPLE,
        liftThreshold: CONVERSION_CORRELATION_LIFT_THRESHOLD,
      },
      format: 'JSONEachRow',
    });

    const rows = await correlationResult.json<ConversionCorrelationRow>();

    for (const row of rows) {
      const basePct = Math.round(parseFloat(row.base_conversion_rate) * 100);
      const conditionalPct = Math.round(parseFloat(row.conditional_conversion_rate) * 100);
      const liftPct = Math.round(parseFloat(row.relative_lift) * 100);
      const sampleSize = parseInt(row.intermediate_users, 10);

      const title = `"${row.intermediate_event}" correlates with ${liftPct}% higher "${row.conversion_event}" conversion`;
      const description = `Users who perform "${row.intermediate_event}" convert on "${row.conversion_event}" at ${conditionalPct}% vs ${basePct}% baseline — a ${liftPct}% relative lift. Sample: ${sampleSize} users performed the intermediate event in the last 30 days.`;

      await this.saveInsight(projectId, 'conversion_correlation', title, description, {
        conversion_event: row.conversion_event,
        intermediate_event: row.intermediate_event,
        total_users: parseInt(row.total_users, 10),
        converters: parseInt(row.converters, 10),
        intermediate_users: sampleSize,
        intermediate_and_converted: parseInt(row.intermediate_and_converted, 10),
        base_conversion_rate: parseFloat(row.base_conversion_rate),
        conditional_conversion_rate: parseFloat(row.conditional_conversion_rate),
        relative_lift: parseFloat(row.relative_lift),
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
