import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PeriodicWorkerMixin } from '@qurvo/worker-core';
import { eq } from 'drizzle-orm';
import { aiMonitors } from '@qurvo/db';
import type { AiMonitor, Database } from '@qurvo/db';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import { DRIZZLE, CLICKHOUSE } from '@qurvo/nestjs-infra';
import { NotificationService } from './notification.service';
import { computeChangePercent } from './monitor.utils';
import { MONITOR_CHECK_INTERVAL_MS, MONITOR_INITIAL_DELAY_MS } from '../constants';

interface BaselineRow {
  baseline_avg: string;
  baseline_std: string;
  current_value: string;
}

@Injectable()
export class MonitorService extends PeriodicWorkerMixin {
  protected readonly intervalMs = MONITOR_CHECK_INTERVAL_MS;
  protected readonly initialDelayMs = MONITOR_INITIAL_DELAY_MS;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
    @InjectPinoLogger(MonitorService.name) protected readonly logger: PinoLogger,
    private readonly notificationService: NotificationService,
  ) {
    super();
  }

  async runCycle(): Promise<void> {
    const monitors = await this.db
      .select()
      .from(aiMonitors)
      .where(eq(aiMonitors.is_active, true));

    this.logger.debug({ count: monitors.length }, 'Checking monitors');

    for (const monitor of monitors) {
      try {
        await this.checkMonitor(monitor);
      } catch (err) {
        this.logger.error({ err, monitorId: monitor.id }, 'Monitor check failed');
      }
    }
  }

  private async checkMonitor(monitor: AiMonitor): Promise<void> {
    const stats = await this.computeStats(monitor);
    if (!stats) return;

    const { current, baselineAvg, baselineStd } = stats;
    const denominator = baselineStd > 0 ? baselineStd : 1;
    const zScore = Math.abs((current - baselineAvg) / denominator);

    this.logger.debug(
      { monitorId: monitor.id, eventName: monitor.event_name, current, baselineAvg, baselineStd, zScore },
      'Monitor stats computed',
    );

    if (zScore >= monitor.threshold_sigma) {
      this.logger.info(
        { monitorId: monitor.id, eventName: monitor.event_name, zScore, threshold: monitor.threshold_sigma },
        'Anomaly detected, sending alert',
      );
      const description = this.generateDescription(monitor, current, baselineAvg, zScore);
      await this.notificationService.send(monitor, description, current, baselineAvg);
    }
  }

  private async computeStats(
    monitor: AiMonitor,
  ): Promise<{ current: number; baselineAvg: number; baselineStd: number } | null> {
    const metricExpr =
      monitor.metric === 'unique_users'
        ? 'uniqExact(person_id)'
        : 'count()';

    const query = `
      SELECT
        avgIf(daily_value, ts_bucket < today()) AS baseline_avg,
        stddevPopIf(daily_value, ts_bucket < today()) AS baseline_std,
        sumIf(daily_value, ts_bucket = today()) AS current_value
      FROM (
        SELECT
          toDate(timestamp) AS ts_bucket,
          ${metricExpr} AS daily_value
        FROM events
        WHERE
          project_id = {project_id:UUID}
          AND event_name = {event_name:String}
          AND timestamp >= now() - INTERVAL 29 DAY
          AND timestamp < now() + INTERVAL 1 DAY
        GROUP BY ts_bucket
      )
    `;

    const result = await this.ch.query({
      query,
      query_params: {
        project_id: monitor.project_id,
        event_name: monitor.event_name,
      },
      format: 'JSONEachRow',
    });

    const rows = await result.json<BaselineRow>();
    if (!rows.length) return null;

    const row = rows[0];
    const baselineAvg = parseFloat(row.baseline_avg) || 0;
    const baselineStd = parseFloat(row.baseline_std) || 0;
    const current = parseFloat(row.current_value) || 0;

    // Need at least a meaningful baseline (more than 0 avg)
    if (baselineAvg === 0) return null;

    return { current, baselineAvg, baselineStd };
  }

  private generateDescription(
    monitor: AiMonitor,
    current: number,
    baselineAvg: number,
    zScore: number,
  ): string {
    const changePercent = computeChangePercent(current, baselineAvg);
    const direction = current > baselineAvg ? 'higher' : 'lower';
    const sigmaRounded = Math.round(zScore * 10) / 10;
    return (
      `Today's ${monitor.metric} for "${monitor.event_name}" is ${Math.abs(changePercent)}% ` +
      `${direction} than the 4-week baseline average (z-score: ${sigmaRounded}σ). ` +
      `This exceeds the configured alert threshold of ${monitor.threshold_sigma}σ.`
    );
  }
}
