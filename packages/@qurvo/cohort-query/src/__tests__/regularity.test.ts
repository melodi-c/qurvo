import { describe, it, expect } from 'vitest';
import { buildPerformedRegularlySubquery } from '../conditions/regularity';
import { compile } from '@qurvo/ch-query';
import type { BuildContext } from '../types';

function makeCtx(dateTo?: string): BuildContext {
  return {
    projectIdParam: 'pid',
    queryParams: { pid: 'test-project-id' },
    counter: { value: 0 },
    dateTo,
  };
}

describe('buildPerformedRegularlySubquery — time_window_days used as lookback window', () => {
  it('uses time_window_days (not total_periods) as INTERVAL DAY for the lookback window', () => {
    const ctx = makeCtx();
    const sql = compile(buildPerformedRegularlySubquery(
      {
        type: 'performed_regularly',
        event_name: 'page_view',
        period_type: 'week',
        total_periods: 4,
        min_periods: 3,
        time_window_days: 30,
      },
      ctx,
    )).sql;

    expect(ctx.queryParams['coh_0_window']).toBe(30);
    expect(sql).toContain('INTERVAL {coh_0_window:UInt32} DAY');
    expect(ctx.queryParams['coh_0_total']).toBeUndefined();
  });

  it('different time_window_days values produce different window query params', () => {
    const ctx7 = makeCtx();
    compile(buildPerformedRegularlySubquery(
      {
        type: 'performed_regularly',
        event_name: 'login',
        period_type: 'day',
        total_periods: 5,
        min_periods: 3,
        time_window_days: 7,
      },
      ctx7,
    ));
    expect(ctx7.queryParams['coh_0_window']).toBe(7);

    const ctx90 = makeCtx();
    compile(buildPerformedRegularlySubquery(
      {
        type: 'performed_regularly',
        event_name: 'login',
        period_type: 'day',
        total_periods: 5,
        min_periods: 3,
        time_window_days: 90,
      },
      ctx90,
    ));
    expect(ctx90.queryParams['coh_0_window']).toBe(90);

    expect(ctx7.queryParams['coh_0_window']).not.toBe(ctx90.queryParams['coh_0_window']);
  });

  it('min_periods is still used in HAVING clause', () => {
    const ctx = makeCtx();
    const sql = compile(buildPerformedRegularlySubquery(
      {
        type: 'performed_regularly',
        event_name: 'purchase',
        period_type: 'month',
        total_periods: 12,
        min_periods: 6,
        time_window_days: 365,
      },
      ctx,
    )).sql;
    expect(ctx.queryParams['coh_0_min']).toBe(6);
    expect(sql).toContain('HAVING uniqExact(toStartOfMonth(timestamp)) >= {coh_0_min:UInt32}');
  });

  it('uses period bucket expression matching period_type for HAVING uniqExact', () => {
    const ctxDay = makeCtx();
    const sqlDay = compile(buildPerformedRegularlySubquery(
      { type: 'performed_regularly', event_name: 'e', period_type: 'day', total_periods: 7, min_periods: 5, time_window_days: 14 },
      ctxDay,
    )).sql;
    expect(sqlDay).toContain('uniqExact(toStartOfDay(timestamp))');

    const ctxWeek = makeCtx();
    const sqlWeek = compile(buildPerformedRegularlySubquery(
      { type: 'performed_regularly', event_name: 'e', period_type: 'week', total_periods: 4, min_periods: 2, time_window_days: 28 },
      ctxWeek,
    )).sql;
    expect(sqlWeek).toContain('uniqExact(toStartOfWeek(timestamp, 1))');

    const ctxMonth = makeCtx();
    const sqlMonth = compile(buildPerformedRegularlySubquery(
      { type: 'performed_regularly', event_name: 'e', period_type: 'month', total_periods: 3, min_periods: 2, time_window_days: 90 },
      ctxMonth,
    )).sql;
    expect(sqlMonth).toContain('uniqExact(toStartOfMonth(timestamp))');
  });

  it('uses parameterised dateTo as upper bound when provided', () => {
    const ctx = makeCtx('2025-03-31 23:59:59');
    const sql = compile(buildPerformedRegularlySubquery(
      {
        type: 'performed_regularly',
        event_name: 'page_view',
        period_type: 'week',
        total_periods: 4,
        min_periods: 2,
        time_window_days: 30,
      },
      ctx,
    )).sql;
    expect(sql).toContain('timestamp >= {coh_date_to:DateTime64(3)} - INTERVAL {coh_0_window:UInt32} DAY');
    expect(sql).toContain('timestamp <= {coh_date_to:DateTime64(3)}');
  });

  it('uses now64(3) as upper bound when dateTo is absent', () => {
    const ctx = makeCtx();
    const sql = compile(buildPerformedRegularlySubquery(
      {
        type: 'performed_regularly',
        event_name: 'page_view',
        period_type: 'day',
        total_periods: 7,
        min_periods: 5,
        time_window_days: 14,
      },
      ctx,
    )).sql;
    expect(sql).toContain('timestamp >= now64(3) - INTERVAL {coh_0_window:UInt32} DAY');
    expect(sql).toContain('timestamp <= now64(3)');
  });

  it('appends event filter clauses after the upper bound', () => {
    const ctx = makeCtx();
    const sql = compile(buildPerformedRegularlySubquery(
      {
        type: 'performed_regularly',
        event_name: 'purchase',
        period_type: 'week',
        total_periods: 4,
        min_periods: 2,
        time_window_days: 30,
        event_filters: [{ property: 'properties.category', operator: 'eq', value: 'electronics' }],
      },
      ctx,
    )).sql;
    expect(sql).toContain("JSONExtractString(properties, 'category')");
  });
});
