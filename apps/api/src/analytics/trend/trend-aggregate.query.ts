import type { ClickHouseClient } from '@qurvo/clickhouse';
import { ChQueryExecutor } from '@qurvo/clickhouse';
import {
  select,
  alias,
  col,
  literal,
  count,
  func,
} from '@qurvo/ch-query';
import {
  analyticsWhere,
  cohortBounds,
  type PropertyFilter,
} from '../query-helpers';
import type { CohortFilterInput } from '@qurvo/cohort-query';

// Public types

export type AggregateType = 'world_map' | 'calendar_heatmap';

export interface TrendAggregateSeries {
  event_name: string;
  label: string;
  filters?: PropertyFilter[];
}

export interface TrendAggregateQueryParams {
  project_id: string;
  series: TrendAggregateSeries[];
  aggregate_type: AggregateType;
  date_from: string;
  date_to: string;
  cohort_filters?: CohortFilterInput[];
  timezone: string;
}

export interface WorldMapRow {
  country: string;
  value: number;
}

export interface HeatmapRow {
  hour_of_day: number;
  day_of_week: number;
  value: number;
}

export type TrendAggregateQueryResult =
  | { type: 'world_map'; world_map: WorldMapRow[] }
  | { type: 'calendar_heatmap'; heatmap: HeatmapRow[] };

// Raw row types from ClickHouse

interface RawWorldMapRow {
  country: string;
  value: string;
}

interface RawHeatmapRow {
  hour_of_day: string;
  day_of_week: string;
  value: string;
}

// World Map query

async function queryWorldMap(
  chx: ChQueryExecutor,
  params: TrendAggregateQueryParams,
): Promise<WorldMapRow[]> {
  // Take the first series event
  const series = params.series[0];

  const query = select(
    col('country'),
    count().as('value'),
  )
    .from('events')
    .where(analyticsWhere({
      projectId: params.project_id,
      from: params.date_from,
      to: params.date_to,
      tz: params.timezone,
      eventName: series.event_name,
      filters: series.filters,
      cohortFilters: params.cohort_filters,
      tsColumn: col('timestamp'),
      ...cohortBounds(params),
    }))
    .groupBy(col('country'))
    .orderBy(col('value'), 'DESC')
    .limit(200)
    .build();

  const rows = await chx.rows<RawWorldMapRow>(query);
  return rows.map((r) => ({
    country: r.country,
    value: Number(r.value),
  }));
}

// Calendar Heatmap query

async function queryCalendarHeatmap(
  chx: ChQueryExecutor,
  params: TrendAggregateQueryParams,
): Promise<HeatmapRow[]> {
  const series = params.series[0];

  // toTimeZone(timestamp, tz) to convert to project timezone before extracting hour/day
  const tzTimestamp = func('toTimeZone', col('timestamp'), literal(params.timezone));

  const query = select(
    alias(func('toHour', tzTimestamp), 'hour_of_day'),
    alias(func('toDayOfWeek', tzTimestamp), 'day_of_week'),
    count().as('value'),
  )
    .from('events')
    .where(analyticsWhere({
      projectId: params.project_id,
      from: params.date_from,
      to: params.date_to,
      tz: params.timezone,
      eventName: series.event_name,
      filters: series.filters,
      cohortFilters: params.cohort_filters,
      tsColumn: col('timestamp'),
      ...cohortBounds(params),
    }))
    .groupBy(col('hour_of_day'), col('day_of_week'))
    .orderBy(col('day_of_week'))
    .orderBy(col('hour_of_day'))
    .build();

  const rows = await chx.rows<RawHeatmapRow>(query);
  return rows.map((r) => ({
    hour_of_day: Number(r.hour_of_day),
    day_of_week: Number(r.day_of_week),
    value: Number(r.value),
  }));
}

// Public entry point

export async function queryTrendAggregate(
  ch: ClickHouseClient,
  params: TrendAggregateQueryParams,
): Promise<TrendAggregateQueryResult> {
  const chx = new ChQueryExecutor(ch);

  if (params.aggregate_type === 'world_map') {
    const worldMap = await queryWorldMap(chx, params);
    return { type: 'world_map', world_map: worldMap };
  }

  const heatmap = await queryCalendarHeatmap(chx, params);
  return { type: 'calendar_heatmap', heatmap };
}
