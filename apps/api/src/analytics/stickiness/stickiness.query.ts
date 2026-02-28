import type { ClickHouseClient } from '@qurvo/clickhouse';
import type { CohortFilterInput } from '@qurvo/ch-query';
import {
  select, col, count, uniqExact, compile,
} from '@qurvo/ch-query';
import {
  analyticsWhere, bucket, resolvedPerson,
  type PropertyFilter,
} from '../query-helpers';

// ── Public types ─────────────────────────────────────────────────────────────

export type StickinessGranularity = 'day' | 'week' | 'month';

export interface StickinessQueryParams {
  project_id: string;
  target_event: string;
  granularity: StickinessGranularity;
  date_from: string;
  date_to: string;
  event_filters?: PropertyFilter[];
  cohort_filters?: CohortFilterInput[];
  timezone?: string;
}

export interface StickinessDataPoint {
  period_count: number;
  user_count: number;
}

export interface StickinessQueryResult {
  granularity: StickinessGranularity;
  total_periods: number;
  data: StickinessDataPoint[];
}

// ── Compute total periods ────────────────────────────────────────────────────

/**
 * Returns the ISO weekday (0=Sun, 1=Mon, …, 6=Sat) of a `YYYY-MM-DD` calendar
 * date as it would appear in `timezone`.
 *
 * Uses UTC noon to represent the date unambiguously — the day-of-week of a
 * calendar date is invariant across timezones, but using noon avoids any
 * hypothetical DST edge-case at midnight.  When `timezone` is absent or `UTC`
 * falls back to plain `getUTCDay()`.
 */
function localDayOfWeek(dateStr: string, timezone?: string): number {
  const [year, month, day] = dateStr.split('-').map(Number);
  // Use UTC noon to represent the calendar date unambiguously.
  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (!timezone || timezone === 'UTC') {
    return d.getUTCDay();
  }
  // Intl gives the day-of-week name for the calendar date in the target timezone.
  const short = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(d);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[short] ?? d.getUTCDay();
}

/**
 * Counts the number of granularity buckets between `from` and `to` (inclusive)
 * matching the way ClickHouse groups events with `toStartOfDay/Week/Month(ts, tz)`.
 *
 * `from` and `to` are `YYYY-MM-DD` calendar-date strings.  When `timezone` is
 * provided (and not `'UTC'`) the week-start day-of-week is computed in that
 * timezone so the result aligns with ClickHouse's Monday-aligned
 * `toStartOfWeek(ts, 1, tz)` buckets.
 */
export function computeTotalPeriods(
  from: string,
  to: string,
  granularity: StickinessGranularity,
  timezone?: string,
): number {
  // Parse each date as UTC noon to represent the calendar date unambiguously.
  const parseDate = (dateStr: string): Date => {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  };
  const d1 = parseDate(from);
  const d2 = parseDate(to);

  switch (granularity) {
    case 'day': {
      // Calendar days: timezone does not affect the calendar-date count.
      const diffMs = d2.getTime() - d1.getTime();
      return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
    }
    case 'week': {
      // Count Monday-aligned ISO week buckets, matching ClickHouse toStartOfWeek(ts, 1[, tz]).
      // Snap both calendar dates to their week-Monday, then count distinct weeks.
      const isoWeekStart = (d: Date, dateStr: string): number => {
        const day = localDayOfWeek(dateStr, timezone); // 0=Sun, 1=Mon, …, 6=Sat
        const daysFromMonday = day === 0 ? 6 : day - 1;
        return d.getTime() - daysFromMonday * 24 * 60 * 60 * 1000;
      };
      const w1 = isoWeekStart(d1, from);
      const w2 = isoWeekStart(d2, to);
      return Math.round((w2 - w1) / (7 * 24 * 60 * 60 * 1000)) + 1;
    }
    case 'month': {
      // Calendar months: timezone does not affect the calendar-month count.
      return (d2.getUTCFullYear() - d1.getUTCFullYear()) * 12 + (d2.getUTCMonth() - d1.getUTCMonth()) + 1;
    }
  }
}

// ── Raw row type ─────────────────────────────────────────────────────────────

interface RawStickinessRow {
  active_periods: string;
  user_count: string;
}

// ── Core query ───────────────────────────────────────────────────────────────

export async function queryStickiness(
  ch: ClickHouseClient,
  params: StickinessQueryParams,
): Promise<StickinessQueryResult> {
  const personPeriods = select(
    resolvedPerson().as('person_id'),
    uniqExact(bucket(params.granularity, 'timestamp', params.timezone)).as('active_periods'),
  )
    .from('events')
    .where(analyticsWhere({
      projectId: params.project_id,
      from: params.date_from,
      to: params.date_to,
      tz: params.timezone,
      eventName: params.target_event,
      filters: params.event_filters,
      cohortFilters: params.cohort_filters,
      dateTo: params.date_to,
      dateFrom: params.date_from,
    }))
    .groupBy(col('person_id'))
    .build();

  const query = select(col('active_periods'), count().as('user_count'))
    .with('person_active_periods', personPeriods)
    .from('person_active_periods')
    .groupBy(col('active_periods'))
    .orderBy(col('active_periods'))
    .build();

  const { sql, params: queryParams } = compile(query);
  const result = await ch.query({ query: sql, query_params: queryParams, format: 'JSONEachRow' });
  const rows = await result.json<RawStickinessRow>();

  const totalPeriods = computeTotalPeriods(params.date_from, params.date_to, params.granularity, params.timezone);

  const data: StickinessDataPoint[] = rows.map((row) => ({
    period_count: Number(row.active_periods),
    user_count: Number(row.user_count),
  }));

  return {
    granularity: params.granularity,
    total_periods: totalPeriods,
    data,
  };
}
