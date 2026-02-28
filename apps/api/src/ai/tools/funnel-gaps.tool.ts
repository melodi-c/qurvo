import { Injectable, Inject } from '@nestjs/common';
import { z } from 'zod';
import { CLICKHOUSE } from '../../providers/clickhouse.provider';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import { defineTool } from './ai-tool.interface';
import type { AiTool } from './ai-tool.interface';
import { toChTs, RESOLVED_PERSON } from '../../analytics/query-helpers';
import type { FunnelGapToolOutput } from '@qurvo/ai-types';

const argsSchema = z.object({
  start_event: z.string().describe('The entry event of the funnel (e.g. "signup")'),
  end_event: z.string().describe('The conversion event of the funnel (e.g. "activation")'),
  date_from: z.string().describe('Start date in ISO format (YYYY-MM-DD)'),
  date_to: z.string().describe('End date in ISO format (YYYY-MM-DD)'),
  max_results: z.number().int().min(1).max(50).nullish()
    .describe('Maximum number of events to return, ranked by |lift|. Default: 10'),
});

const tool = defineTool({
  name: 'query_funnel_gaps',
  description:
    'Funnel gap analysis — finds intermediate events that statistically correlate with conversion between two events. ' +
    'For each event observed between start_event and end_event, computes the conversion rate for users who saw that event ' +
    'vs those who did not, and returns a ranked list by relative lift. ' +
    'Use this to discover which actions or features drive (or block) funnel conversion.',
  schema: argsSchema,
  visualizationType: 'funnel_gap_chart',
});

interface RawGapRow {
  event_name: string;
  saw_count: string;
  saw_converted: string;
  no_saw_count: string;
  no_saw_converted: string;
}

export interface FunnelGapItem {
  event_name: string;
  /** Users who performed this intermediate event */
  saw_count: number;
  /** Conversion rate among users who saw the event (0–1) */
  saw_conversion_rate: number;
  /** Users who did NOT perform this intermediate event */
  no_saw_count: number;
  /** Conversion rate among users who did NOT see the event (0–1) */
  no_saw_conversion_rate: number;
  /** Relative lift: (saw_rate - no_saw_rate) / no_saw_rate. Positive = helps, negative = hurts. */
  relative_lift: number;
  /** Sample size of the smaller group (used to indicate statistical confidence) */
  min_sample_size: number;
}

@Injectable()
export class FunnelGapsTool implements AiTool {
  readonly name = tool.name;
  readonly cacheable = true;

  constructor(
    @Inject(CLICKHOUSE) private readonly ch: ClickHouseClient,
  ) {}

  definition() { return tool.definition; }

  run = tool.createRun(async (args, _userId, projectId) => {
    const maxResults = args.max_results ?? 10;

    const queryParams: Record<string, unknown> = {
      project_id: projectId,
      from: toChTs(args.date_from),
      to: toChTs(args.date_to, true),
      start_event: args.start_event,
      end_event: args.end_event,
      min_sample: 30,
    };

    // Strategy:
    // 1. Find all users who fired start_event in the date range → "entrants"
    // 2. Among entrants, find who also fired end_event AFTER start_event → "converters"
    // 3. For each intermediate event (not start/end), find which entrants fired it
    //    between their first start_event and either their conversion or end of window
    // 4. Compute conversion rate for saw vs no-saw groups
    // 5. Filter by min_sample >= 30 in both groups, rank by |lift|
    //
    // ClickHouse note: CTEs are not materialised (inlined like views).
    // We avoid multi-CTE references by using subqueries or IN/NOT IN patterns.

    const sql = `
      WITH
        -- Step 1: Per-user first occurrence of start_event in date range
        entrants AS (
          SELECT
            ${RESOLVED_PERSON} AS pid,
            min(timestamp) AS start_ts
          FROM events
          WHERE
            project_id = {project_id:UUID}
            AND event_name = {start_event:String}
            AND timestamp >= {from:DateTime64(3)}
            AND timestamp <= {to:DateTime64(3)}
          GROUP BY pid
        ),
        -- Step 2: Among entrants, those who fired end_event AFTER their start_ts
        converters AS (
          SELECT DISTINCT ${RESOLVED_PERSON} AS pid
          FROM events
          INNER JOIN entrants ON ${RESOLVED_PERSON} = entrants.pid
          WHERE
            project_id = {project_id:UUID}
            AND event_name = {end_event:String}
            AND timestamp > entrants.start_ts
            AND timestamp <= {to:DateTime64(3)}
        ),
        -- Step 3: All intermediate events per entrant (between start_ts and end of window)
        -- Exclude start_event and end_event themselves
        intermediate AS (
          SELECT DISTINCT
            e.event_name,
            ${RESOLVED_PERSON} AS pid
          FROM events e
          INNER JOIN entrants ON ${RESOLVED_PERSON} = entrants.pid
          WHERE
            e.project_id = {project_id:UUID}
            AND e.event_name != {start_event:String}
            AND e.event_name != {end_event:String}
            AND e.timestamp > entrants.start_ts
            AND e.timestamp <= {to:DateTime64(3)}
        ),
        -- Step 4: Total entrant count (materialise as scalar)
        total_entrants AS (
          SELECT uniqExact(pid) AS n FROM entrants
        ),
        -- Step 5: Per intermediate event: saw counts and conversion counts
        per_event AS (
          SELECT
            i.event_name,
            uniqExact(i.pid) AS saw_count,
            uniqExactIf(i.pid, i.pid IN (SELECT pid FROM converters)) AS saw_converted
          FROM intermediate i
          GROUP BY i.event_name
        )
      SELECT
        pe.event_name,
        pe.saw_count,
        pe.saw_converted,
        (SELECT n FROM total_entrants) - pe.saw_count AS no_saw_count,
        (SELECT uniqExact(pid) FROM converters) - pe.saw_converted AS no_saw_converted
      FROM per_event pe
      WHERE
        pe.saw_count >= {min_sample:UInt32}
        AND ((SELECT n FROM total_entrants) - pe.saw_count) >= {min_sample:UInt32}
      ORDER BY
        abs(
          (pe.saw_converted / pe.saw_count) -
          (
            ((SELECT uniqExact(pid) FROM converters) - pe.saw_converted) /
            ((SELECT n FROM total_entrants) - pe.saw_count)
          )
        ) DESC
      LIMIT {max_results:UInt32}
    `;

    queryParams['max_results'] = maxResults;

    const res = await this.ch.query({ query: sql, query_params: queryParams, format: 'JSONEachRow' });
    const rows = await res.json<RawGapRow>();

    const items: FunnelGapItem[] = rows.map((r) => {
      const sawCount = Number(r.saw_count);
      const sawConverted = Number(r.saw_converted);
      const noSawCount = Number(r.no_saw_count);
      const noSawConverted = Number(r.no_saw_converted);

      const sawRate = sawCount > 0 ? sawConverted / sawCount : 0;
      const noSawRate = noSawCount > 0 ? noSawConverted / noSawCount : 0;

      // Relative lift: (saw_rate - no_saw_rate) / no_saw_rate
      // Guard against division by zero when baseline rate is 0
      const relativeLift = noSawRate > 0
        ? (sawRate - noSawRate) / noSawRate
        : sawRate > 0 ? 1 : 0;

      return {
        event_name: r.event_name,
        saw_count: sawCount,
        saw_conversion_rate: Math.round(sawRate * 10000) / 10000,
        no_saw_count: noSawCount,
        no_saw_conversion_rate: Math.round(noSawRate * 10000) / 10000,
        relative_lift: Math.round(relativeLift * 10000) / 10000,
        min_sample_size: Math.min(sawCount, noSawCount),
      };
    });

    // Sort final result by |lift| descending (ClickHouse ORDER BY already does this,
    // but we re-sort in JS to guarantee order after numeric conversion)
    items.sort((a, b) => Math.abs(b.relative_lift) - Math.abs(a.relative_lift));

    return {
      funnel_step_from: args.start_event,
      funnel_step_to: args.end_event,
      items: items.map((item) => ({
        event_name: item.event_name,
        relative_lift_pct: Math.round(item.relative_lift * 10000) / 100,
        users_with_event: item.saw_count,
        users_without_event: item.no_saw_count,
      })),
    } satisfies FunnelGapToolOutput;
  });
}
