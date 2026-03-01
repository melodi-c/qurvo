import { Injectable, Inject } from '@nestjs/common';
import { z } from 'zod';
import { CLICKHOUSE } from '../../providers/clickhouse.provider';
import type { ClickHouseClient } from '@qurvo/clickhouse';
import { ChQueryExecutor } from '@qurvo/clickhouse';
import { defineTool } from './ai-tool.interface';
import type { AiTool } from './ai-tool.interface';
import {
  select,
  col,
  namedParam,
  param,
  eq,
  neq,
  gt,
  gte,
  lte,
  func,
  sub,
  div,
  uniqExact,
  subquery,
  inSubquery,
} from '@qurvo/ch-query';
import { toChTs } from '../../analytics/query-helpers';
import { resolvedPerson } from '../../analytics/query-helpers';
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

    const projectIdParam = namedParam('project_id', 'UUID', projectId);
    const toParam = param('DateTime64(3)', toTs);
    const startEventParam = namedParam('start_event', 'String', args.start_event);
    const endEventParam = namedParam('end_event', 'String', args.end_event);
    const minSampleParam = namedParam('min_sample', 'UInt32', 30);

    // CTE 1: entrants — first occurrence of start_event per user
    const entrantsNode = firstEventCte({
      projectId,
      eventName: args.start_event,
      from: fromTs,
      to: toTs,
    });

    // CTE 2: converters — entrants who also fired end_event AFTER start_event
    const convertersNode = select(resolvedPerson().as('pid'))
      .distinct()
      .from('events')
      .join('INNER', 'entrants', undefined, eq(resolvedPerson(), col('entrants.pid')))
      .where(
        eq(col('project_id'), projectIdParam),
        eq(col('event_name'), endEventParam),
        gt(col('timestamp'), col('entrants.start_ts')),
        lte(col('timestamp'), toParam),
      )
      .build();

    // CTE 3: intermediate — distinct events per entrant between start_ts and window end
    const intermediateNode = select(
      col('e.event_name'),
      resolvedPerson().as('pid'),
    )
      .distinct()
      .from('events', 'e')
      .join('INNER', 'entrants', undefined, eq(resolvedPerson(), col('entrants.pid')))
      .where(
        eq(col('e.project_id'), projectIdParam),
        neq(col('e.event_name'), startEventParam),
        neq(col('e.event_name'), endEventParam),
        gt(col('e.timestamp'), col('entrants.start_ts')),
        lte(col('e.timestamp'), toParam),
      )
      .build();

    // CTE 4: total_entrants — total unique entrants count
    const totalEntrantsNode = select(uniqExact(col('pid')).as('n'))
      .from('entrants')
      .build();

    // CTE 5: per_event — saw counts and conversion counts per intermediate event
    // uniqExactIf(pid, pid IN (SELECT pid FROM converters))
    const convertersPidSubquery = select(col('pid')).from('converters').build();
    const perEventNode = select(
      col('i.event_name'),
      uniqExact(col('i.pid')).as('saw_count'),
      func('uniqExactIf', col('i.pid'), inSubquery(col('i.pid'), convertersPidSubquery)).as('saw_converted'),
    )
      .from('intermediate', 'i')
      .groupBy(col('i.event_name'))
      .build();

    // Scalar subqueries for the final SELECT and WHERE
    const totalN = subquery(select(col('n')).from('total_entrants').build());
    const totalConverted = subquery(
      select(uniqExact(col('pid'))).from('converters').build(),
    );

    // Final query: compute no_saw_count and no_saw_converted, filter by min_sample, order by |lift|
    const query = select(
      col('pe.event_name'),
      col('pe.saw_count'),
      col('pe.saw_converted'),
      sub(totalN, col('pe.saw_count')).as('no_saw_count'),
      sub(totalConverted, col('pe.saw_converted')).as('no_saw_converted'),
    )
      .from('per_event', 'pe')
      .where(
        gte(col('pe.saw_count'), minSampleParam),
        gte(sub(totalN, col('pe.saw_count')), minSampleParam),
      )
      .orderBy(
        func('abs',
          sub(
            div(col('pe.saw_converted'), col('pe.saw_count')),
            div(
              sub(totalConverted, col('pe.saw_converted')),
              sub(totalN, col('pe.saw_count')),
            ),
          ),
        ),
        'DESC',
      )
      .limit(maxResults)
      .with('entrants', entrantsNode)
      .with('converters', convertersNode)
      .with('intermediate', intermediateNode)
      .with('total_entrants', totalEntrantsNode)
      .with('per_event', perEventNode)
      .build();

    const rows = await new ChQueryExecutor(this.ch).rows<RawGapRow>(query);

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
