import { Injectable, Inject } from '@nestjs/common';
import { z } from 'zod';
import { CLICKHOUSE } from '../../providers/clickhouse.provider';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import { defineTool } from './ai-tool.interface';
import type { AiTool } from './ai-tool.interface';
import { compile } from '@qurvo/ch-query';
import { toChTs, RESOLVED_PERSON } from '../../analytics/query-helpers';
import { firstEventCte } from './first-event-cte';
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
  saw_count: number;
  saw_conversion_rate: number;
  no_saw_count: number;
  no_saw_conversion_rate: number;
  relative_lift: number;
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
    const fromTs = toChTs(args.date_from);
    const toTs = toChTs(args.date_to, true);

    // Build the "entrants" CTE via the shared firstEventCte helper
    const entrantsNode = firstEventCte({
      projectId,
      eventName: args.start_event,
      from: fromTs,
      to: toTs,
    });
    const entrantsCompiled = compile(entrantsNode);

    // Manual params for the remaining CTEs (no collisions with auto-generated p_N names)
    const queryParams: Record<string, unknown> = {
      ...entrantsCompiled.params,
      project_id: projectId,
      to: toTs,
      start_event: args.start_event,
      end_event: args.end_event,
      min_sample: 30,
      max_results: maxResults,
    };

    // Strategy:
    // 1. entrants CTE (shared helper): first occurrence of start_event per user
    // 2. converters: entrants who also fired end_event AFTER start_event
    // 3. intermediate: distinct events per entrant between start_ts and window end
    // 4. per_event: saw counts and conversion counts per intermediate event
    // 5. Filter by min_sample >= 30, rank by |lift|
    //
    // ClickHouse note: CTEs are not materialised (inlined like views).
    // We avoid multi-CTE references by using subqueries or IN/NOT IN patterns.

    const sql = `
      WITH
        entrants AS (${entrantsCompiled.sql}),
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
        total_entrants AS (
          SELECT uniqExact(pid) AS n FROM entrants
        ),
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

    const res = await this.ch.query({ query: sql, query_params: queryParams, format: 'JSONEachRow' });
    const rows = await res.json<RawGapRow>();

    const items: FunnelGapItem[] = rows.map((r) => {
      const sawCount = Number(r.saw_count);
      const sawConverted = Number(r.saw_converted);
      const noSawCount = Number(r.no_saw_count);
      const noSawConverted = Number(r.no_saw_converted);

      const sawRate = sawCount > 0 ? sawConverted / sawCount : 0;
      const noSawRate = noSawCount > 0 ? noSawConverted / noSawCount : 0;

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
