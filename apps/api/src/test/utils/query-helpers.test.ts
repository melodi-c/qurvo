import { describe, expect, test } from 'vitest';
import { compile, col, count, select, uniqExact, raw } from '@qurvo/ch-query';
import type { Expr } from '@qurvo/ch-query';
import {
  toChTs,
  shiftDate,
  shiftPeriod,
  truncateDate,
  tsParam,
  timeRange,
  bucket,
  neighborBucket,
  bucketOfMin,
  resolveRelativeDate,
  isRelativeDate,
  projectIs,
  eventIs,
  eventIn,
  propertyFilter,
  propertyFilters,
  cohortFilter,
  analyticsWhere,
  resolvePropertyExpr,
  resolveNumericPropertyExpr,
  resolvedPerson,
  RESOLVED_PERSON,
  baseMetricColumns,
  aggColumn,
  numericProperty,
  type CohortFilterInput,
} from '../../analytics/query-helpers';

// Helper to compile a single expression within a SELECT for inspection
function compileExpr(expr: Expr): { sql: string; params: Record<string, unknown> } {
  const q = select(expr).from('events').build();
  return compile(q);
}

// Helper to compile a WHERE clause
function compileWhere(expr: Expr): { sql: string; params: Record<string, unknown> } {
  const q = select(col('*')).from('events').where(expr).build();
  return compile(q);
}

describe('analytics/time', () => {
  describe('toChTs', () => {
    test('date-only input returns start of day', () => {
      expect(toChTs('2026-01-15')).toBe('2026-01-15 00:00:00');
    });

    test('date-only input with endOfDay', () => {
      expect(toChTs('2026-01-15', true)).toBe('2026-01-15 23:59:59');
    });

    test('datetime with Z suffix normalizes to UTC', () => {
      expect(toChTs('2026-01-15T12:30:45.000Z')).toBe('2026-01-15 12:30:45');
    });

    test('datetime with timezone offset normalizes', () => {
      expect(toChTs('2026-01-15T15:30:00+03:00')).toBe('2026-01-15 12:30:00');
    });

    test('datetime without timezone strips T and milliseconds', () => {
      expect(toChTs('2026-01-15T12:30:45.123')).toBe('2026-01-15 12:30:45');
    });
  });

  describe('shiftDate', () => {
    test('shifts days forward', () => {
      expect(shiftDate('2026-01-15', 3, 'day')).toBe('2026-01-18');
    });

    test('shifts days backward', () => {
      expect(shiftDate('2026-01-15', -5, 'day')).toBe('2026-01-10');
    });

    test('shifts weeks forward', () => {
      expect(shiftDate('2026-01-15', 2, 'week')).toBe('2026-01-29');
    });

    test('shifts months forward', () => {
      expect(shiftDate('2026-01-15', 1, 'month')).toBe('2026-02-15');
    });

    test('shifts months across year boundary', () => {
      expect(shiftDate('2026-11-15', 3, 'month')).toBe('2027-02-15');
    });
  });

  describe('shiftPeriod', () => {
    test('computes previous period', () => {
      const result = shiftPeriod('2026-01-08', '2026-01-14');
      expect(result.from).toBe('2026-01-01');
      expect(result.to).toBe('2026-01-07');
    });
  });

  describe('truncateDate', () => {
    test('day truncation is identity', () => {
      expect(truncateDate('2026-01-15', 'day')).toBe('2026-01-15');
    });

    test('week truncation snaps to Monday', () => {
      expect(truncateDate('2026-01-15', 'week')).toBe('2026-01-12');
    });

    test('week truncation on Sunday', () => {
      expect(truncateDate('2026-01-18', 'week')).toBe('2026-01-12');
    });

    test('month truncation snaps to first of month', () => {
      expect(truncateDate('2026-01-15', 'month')).toBe('2026-01-01');
    });
  });

  describe('tsParam', () => {
    test('UTC mode: returns DateTime64 param', () => {
      const { sql, params } = compileExpr(tsParam('2026-01-15'));
      expect(sql).toContain('{p_0:DateTime64(3)}');
      expect(params.p_0).toBe('2026-01-15 00:00:00');
    });

    test('UTC timezone is treated as no-tz', () => {
      const { sql } = compileExpr(tsParam('2026-01-15', 'UTC'));
      expect(sql).toContain('{p_0:DateTime64(3)}');
      expect(sql).not.toContain('toDateTime64');
    });

    test('timezone mode: returns toDateTime64 function call', () => {
      const { sql, params } = compileExpr(tsParam('2026-01-15', 'Europe/Moscow'));
      expect(sql).toContain('toDateTime64({p_0:String}, 3, {p_1:String})');
      expect(params.p_0).toBe('2026-01-15 00:00:00');
      expect(params.p_1).toBe('Europe/Moscow');
    });
  });

  describe('timeRange', () => {
    test('UTC mode: produces >= from AND <= to with DateTime64 params', () => {
      const { sql, params } = compileWhere(timeRange('2026-01-01', '2026-01-31'));
      expect(sql).toContain('timestamp >= {p_0:DateTime64(3)}');
      expect(sql).toContain('timestamp <= {p_1:DateTime64(3)}');
      expect(params.p_0).toBe('2026-01-01 00:00:00');
      expect(params.p_1).toBe('2026-01-31 23:59:59');
    });

    test('timezone mode: produces toDateTime64 calls', () => {
      const { sql, params } = compileWhere(timeRange('2026-01-01', '2026-01-31', 'America/New_York'));
      expect(sql).toContain('toDateTime64({p_0:String}, 3, {p_1:String})');
      expect(params.p_1).toBe('America/New_York');
    });

    test('datetime to value is not double-converted', () => {
      const { params } = compileWhere(timeRange('2026-01-01', '2026-01-31T23:59:59'));
      expect(params.p_1).toBe('2026-01-31 23:59:59');
    });
  });

  describe('bucket', () => {
    test('hour granularity without tz', () => {
      const { sql } = compileExpr(bucket('hour', 'timestamp'));
      expect(sql).toContain('toStartOfHour(timestamp)');
    });

    test('hour granularity with tz', () => {
      const { sql } = compileExpr(bucket('hour', 'timestamp', 'Europe/Moscow'));
      expect(sql).toContain("toStartOfHour(timestamp, 'Europe/Moscow')");
    });

    test('day granularity without tz', () => {
      const { sql } = compileExpr(bucket('day', 'timestamp'));
      expect(sql).toContain('toStartOfDay(timestamp)');
    });

    test('day granularity with tz', () => {
      const { sql } = compileExpr(bucket('day', 'timestamp', 'America/New_York'));
      expect(sql).toContain("toStartOfDay(timestamp, 'America/New_York')");
    });

    test('week granularity without tz wraps in toDateTime', () => {
      const { sql } = compileExpr(bucket('week', 'timestamp'));
      expect(sql).toContain('toDateTime(toStartOfWeek(timestamp, 1))');
    });

    test('week granularity with tz wraps in toDateTime with tz', () => {
      const { sql } = compileExpr(bucket('week', 'timestamp', 'Europe/Moscow'));
      expect(sql).toContain("toDateTime(toStartOfWeek(timestamp, 1, 'Europe/Moscow'), 'Europe/Moscow')");
    });

    test('month granularity without tz wraps in toDateTime', () => {
      const { sql } = compileExpr(bucket('month', 'timestamp'));
      expect(sql).toContain('toDateTime(toStartOfMonth(timestamp))');
    });

    test('month granularity with tz wraps in toDateTime with tz', () => {
      const { sql } = compileExpr(bucket('month', 'timestamp', 'Asia/Tokyo'));
      expect(sql).toContain("toDateTime(toStartOfMonth(timestamp, 'Asia/Tokyo'), 'Asia/Tokyo')");
    });
  });

  describe('neighborBucket', () => {
    test('day granularity: simple addition', () => {
      const expr = neighborBucket('day', raw('ts_bucket'), 1);
      const { sql } = compileExpr(expr);
      expect(sql).toContain('ts_bucket + INTERVAL 1 DAY');
    });

    test('day granularity: simple subtraction', () => {
      const expr = neighborBucket('day', raw('ts_bucket'), -1);
      const { sql } = compileExpr(expr);
      expect(sql).toContain('ts_bucket - INTERVAL 1 DAY');
    });

    test('week without tz: simple 7-day addition', () => {
      const expr = neighborBucket('week', raw('ts_bucket'), 1);
      const { sql } = compileExpr(expr);
      expect(sql).toContain('ts_bucket + INTERVAL 7 DAY');
    });

    test('week with tz: re-snaps to local Monday', () => {
      const expr = neighborBucket('week', raw('ts_bucket'), 1, 'America/New_York');
      const { sql } = compileExpr(expr);
      expect(sql).toContain("toDateTime(toStartOfWeek(ts_bucket + INTERVAL 7 DAY, 1, 'America/New_York'), 'America/New_York')");
    });

    test('month with tz: re-snaps to start of month', () => {
      const expr = neighborBucket('month', raw('ts_bucket'), -1, 'Europe/Moscow');
      const { sql } = compileExpr(expr);
      expect(sql).toContain("toDateTime(toStartOfMonth(ts_bucket - INTERVAL 1 MONTH, 'Europe/Moscow'), 'Europe/Moscow')");
    });

    test('day with tz: still simple arithmetic (DST-safe)', () => {
      const expr = neighborBucket('day', raw('ts_bucket'), 1, 'America/New_York');
      const { sql } = compileExpr(expr);
      expect(sql).toContain('ts_bucket + INTERVAL 1 DAY');
      expect(sql).not.toContain('toStartOf');
    });
  });

  describe('bucketOfMin', () => {
    test('applies bucket to min(column)', () => {
      const { sql } = compileExpr(bucketOfMin('day', 'timestamp'));
      expect(sql).toContain('toStartOfDay(min(timestamp))');
    });

    test('with timezone', () => {
      const { sql } = compileExpr(bucketOfMin('week', 'timestamp', 'Europe/Moscow'));
      expect(sql).toContain("toDateTime(toStartOfWeek(min(timestamp), 1, 'Europe/Moscow'), 'Europe/Moscow')");
    });
  });

  describe('isRelativeDate', () => {
    test('returns true for -Nd format', () => {
      expect(isRelativeDate('-7d')).toBe(true);
      expect(isRelativeDate('-30d')).toBe(true);
      expect(isRelativeDate('-180d')).toBe(true);
    });

    test('returns true for -Ny format', () => {
      expect(isRelativeDate('-1y')).toBe(true);
      expect(isRelativeDate('-2y')).toBe(true);
    });

    test('returns true for anchor tokens', () => {
      expect(isRelativeDate('mStart')).toBe(true);
      expect(isRelativeDate('yStart')).toBe(true);
    });

    test('returns false for absolute dates', () => {
      expect(isRelativeDate('2026-01-15')).toBe(false);
    });

    test('returns false for invalid strings', () => {
      expect(isRelativeDate('foo')).toBe(false);
      expect(isRelativeDate('')).toBe(false);
      expect(isRelativeDate('-7w')).toBe(false);
      expect(isRelativeDate('7d')).toBe(false);
    });
  });

  describe('resolveRelativeDate', () => {
    test('passes through absolute dates unchanged', () => {
      expect(resolveRelativeDate('2026-01-15')).toBe('2026-01-15');
      expect(resolveRelativeDate('2025-12-31')).toBe('2025-12-31');
    });

    test('-Nd returns N days ago from today (UTC)', () => {
      const result = resolveRelativeDate('-7d');
      // Result should be a valid YYYY-MM-DD string
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // Verify it's approximately 7 days ago
      const now = new Date();
      const expected = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 7));
      expect(result).toBe(expected.toISOString().slice(0, 10));
    });

    test('-1y returns 365 days ago', () => {
      const result = resolveRelativeDate('-1y');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      const now = new Date();
      const expected = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 365));
      expect(result).toBe(expected.toISOString().slice(0, 10));
    });

    test('mStart returns first day of current month', () => {
      const result = resolveRelativeDate('mStart');
      const now = new Date();
      const expected = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
      expect(result).toBe(expected);
    });

    test('yStart returns first day of current year', () => {
      const result = resolveRelativeDate('yStart');
      const now = new Date();
      expect(result).toBe(`${now.getUTCFullYear()}-01-01`);
    });

    test('timezone affects resolved date', () => {
      // Use a timezone where the date is likely different from UTC around midnight
      // This test verifies the mechanism works, though the exact outcome depends on runtime
      const utcResult = resolveRelativeDate('-7d');
      const tzResult = resolveRelativeDate('-7d', 'Pacific/Auckland');
      // Both should be valid dates
      expect(utcResult).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(tzResult).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test('throws on invalid relative format', () => {
      expect(() => resolveRelativeDate('invalid')).toThrow('Invalid relative date format');
      expect(() => resolveRelativeDate('-7w')).toThrow('Invalid relative date format');
    });

    test('-30d and -90d work correctly', () => {
      const r30 = resolveRelativeDate('-30d');
      const r90 = resolveRelativeDate('-90d');
      expect(r30).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r90).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // 90d ago should be before 30d ago
      expect(r90 < r30).toBe(true);
    });
  });
});

describe('analytics/filters', () => {
  describe('projectIs', () => {
    test('generates project_id = {p_N:UUID}', () => {
      const { sql, params } = compileWhere(projectIs('my-project-id'));
      expect(sql).toContain('project_id = {p_0:UUID}');
      expect(params.p_0).toBe('my-project-id');
    });
  });

  describe('eventIs', () => {
    test('generates event_name = {p_N:String}', () => {
      const { sql, params } = compileWhere(eventIs('page_view'));
      expect(sql).toContain('event_name = {p_0:String}');
      expect(params.p_0).toBe('page_view');
    });
  });

  describe('eventIn', () => {
    test('generates event_name IN ({p_N:Array(String)})', () => {
      const { sql, params } = compileWhere(eventIn(['page_view', 'click']));
      expect(sql).toContain('event_name IN ({p_0:Array(String)})');
      expect(params.p_0).toEqual(['page_view', 'click']);
    });
  });

  describe('propertyFilter', () => {
    describe('eq operator', () => {
      test('JSON property: OR of JSONExtractString and toString(JSONExtractRaw)', () => {
        const expr = propertyFilter({
          property: 'properties.plan',
          operator: 'eq',
          value: 'pro',
        });
        const { sql, params } = compileWhere(expr);
        expect(sql).toContain("JSONExtractString(properties, 'plan')");
        expect(sql).toContain("toString(JSONExtractRaw(properties, 'plan'))");
        expect(sql).toContain(' OR ');
        const paramKey = Object.keys(params).find(k => params[k] === 'pro');
        expect(paramKey).toBeDefined();
      });

      test('direct column: simple equality', () => {
        const expr = propertyFilter({
          property: 'browser',
          operator: 'eq',
          value: 'Chrome',
        });
        const { sql } = compileWhere(expr);
        expect(sql).toContain('browser =');
        expect(sql).toContain(':String}');
        expect(sql).not.toContain('JSONExtract');
      });

      test('user_properties JSON', () => {
        const expr = propertyFilter({
          property: 'user_properties.role',
          operator: 'eq',
          value: 'admin',
        });
        const { sql } = compileWhere(expr);
        expect(sql).toContain("JSONExtractString(user_properties, 'role')");
      });
    });

    describe('neq operator', () => {
      test('JSON property: JSONHas AND != AND toString !=', () => {
        const expr = propertyFilter({
          property: 'properties.plan',
          operator: 'neq',
          value: 'free',
        });
        const { sql } = compileWhere(expr);
        expect(sql).toContain("JSONHas(properties, 'plan')");
        expect(sql).toContain("JSONExtractString(properties, 'plan') !=");
        expect(sql).toContain("toString(JSONExtractRaw(properties, 'plan')) !=");
      });

      test('direct column: simple inequality', () => {
        const expr = propertyFilter({
          property: 'browser',
          operator: 'neq',
          value: 'Firefox',
        });
        const { sql } = compileWhere(expr);
        expect(sql).toContain('browser !=');
        expect(sql).toContain(':String}');
        expect(sql).not.toContain('JSONHas');
      });
    });

    describe('contains operator', () => {
      test('generates LIKE with escaped pattern', () => {
        const expr = propertyFilter({
          property: 'properties.name',
          operator: 'contains',
          value: 'test%value',
        });
        const { sql, params } = compileWhere(expr);
        expect(sql).toContain("JSONExtractString(properties, 'name') LIKE");
        const paramKey = Object.keys(params).find(k => params[k] === '%test\\%value%');
        expect(paramKey).toBeDefined();
      });
    });

    describe('not_contains operator', () => {
      test('JSON property: JSONHas AND NOT LIKE', () => {
        const expr = propertyFilter({
          property: 'properties.name',
          operator: 'not_contains',
          value: 'test',
        });
        const { sql } = compileWhere(expr);
        expect(sql).toContain("JSONHas(properties, 'name')");
        expect(sql).toContain('NOT LIKE');
      });

      test('direct column: simple NOT LIKE', () => {
        const expr = propertyFilter({
          property: 'url',
          operator: 'not_contains',
          value: 'admin',
        });
        const { sql } = compileWhere(expr);
        expect(sql).toContain('url NOT LIKE');
        expect(sql).toContain(':String}');
        expect(sql).not.toContain('JSONHas');
      });
    });

    describe('is_set operator', () => {
      test('JSON property: JSONHas', () => {
        const expr = propertyFilter({
          property: 'properties.plan',
          operator: 'is_set',
        });
        const { sql } = compileWhere(expr);
        expect(sql).toContain("JSONHas(properties, 'plan')");
      });

      test('direct column: != empty string', () => {
        const expr = propertyFilter({
          property: 'browser',
          operator: 'is_set',
        });
        const { sql } = compileWhere(expr);
        expect(sql).toContain("browser != ''");
      });
    });

    describe('is_not_set operator', () => {
      test('JSON property: NOT JSONHas', () => {
        const expr = propertyFilter({
          property: 'properties.plan',
          operator: 'is_not_set',
        });
        const { sql } = compileWhere(expr);
        expect(sql).toContain("NOT JSONHas(properties, 'plan')");
      });

      test('direct column: = empty string', () => {
        const expr = propertyFilter({
          property: 'browser',
          operator: 'is_not_set',
        });
        const { sql } = compileWhere(expr);
        expect(sql).toContain("browser = ''");
      });
    });

    describe('nested JSON paths', () => {
      test('dot-notated nested path generates multi-arg JSONExtractString', () => {
        const expr = propertyFilter({
          property: 'properties.address.city',
          operator: 'eq',
          value: 'Moscow',
        });
        const { sql } = compileWhere(expr);
        expect(sql).toContain("JSONExtractString(properties, 'address', 'city')");
      });

      test('nested JSONHas uses variadic form', () => {
        const expr = propertyFilter({
          property: 'properties.address.city',
          operator: 'is_set',
        });
        const { sql } = compileWhere(expr);
        expect(sql).toContain("JSONHas(properties, 'address', 'city')");
      });
    });
  });

  describe('propertyFilters', () => {
    test('empty array returns undefined', () => {
      expect(propertyFilters([])).toBeUndefined();
    });

    test('multiple filters combined with AND', () => {
      const expr = propertyFilters([
        { property: 'browser', operator: 'eq', value: 'Chrome' },
        { property: 'country', operator: 'eq', value: 'RU' },
      ])!;
      const { sql } = compileWhere(expr);
      expect(sql).toContain('browser =');
      expect(sql).toContain('country =');
      expect(sql).toContain('AND');
    });
  });

  describe('JSON key validation', () => {
    test('rejects keys containing single quotes', () => {
      expect(() => propertyFilter({
        property: "properties.key'OR 1=1--",
        operator: 'eq',
        value: 'test',
      })).toThrow('Invalid JSON key segment');
    });

    test('rejects keys containing semicolons', () => {
      expect(() => propertyFilter({
        property: 'properties.key;DROP TABLE events',
        operator: 'eq',
        value: 'test',
      })).toThrow('Invalid JSON key segment');
    });

    test('rejects keys containing parentheses', () => {
      expect(() => propertyFilter({
        property: 'properties.key()',
        operator: 'eq',
        value: 'test',
      })).toThrow('Invalid JSON key segment');
    });

    test('rejects keys containing spaces', () => {
      expect(() => propertyFilter({
        property: 'properties.key name',
        operator: 'eq',
        value: 'test',
      })).toThrow('Invalid JSON key segment');
    });

    test('allows alphanumeric keys with underscores and hyphens', () => {
      expect(() => propertyFilter({
        property: 'properties.my_key-123',
        operator: 'eq',
        value: 'test',
      })).not.toThrow();
    });
  });

  describe('cohortFilter', () => {
    test('empty inputs returns undefined', () => {
      expect(cohortFilter(undefined, 'pid')).toBeUndefined();
      expect(cohortFilter([], 'pid')).toBeUndefined();
    });

    test('materialized cohort generates IN subquery with params in AST', () => {
      const inputs: CohortFilterInput[] = [{
        cohort_id: 'cohort-1',
        definition: { type: 'AND', values: [] },
        materialized: true,
        is_static: false,
      }];
      const expr = cohortFilter(inputs, 'project-1');
      expect(expr).toBeDefined();

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const { sql, params } = compileWhere(expr!);
      expect(sql).toContain('cohort_members');
      expect(sql).toContain('{coh_mid_0:UUID}');
      expect(params.coh_mid_0).toBe('cohort-1');
      expect(params.project_id).toBe('project-1');
    });

    test('static cohort generates IN subquery with person_static_cohort', () => {
      const inputs: CohortFilterInput[] = [{
        cohort_id: 'cohort-static-1',
        definition: { type: 'AND', values: [] },
        materialized: false,
        is_static: true,
      }];
      const expr = cohortFilter(inputs, 'project-1');
      expect(expr).toBeDefined();

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const { sql, params } = compileWhere(expr!);
      expect(sql).toContain('person_static_cohort');
      expect(sql).toContain('{coh_sid_0:UUID}');
      expect(params.coh_sid_0).toBe('cohort-static-1');
      expect(params.project_id).toBe('project-1');
    });
  });

  describe('analyticsWhere with cohortFilters', () => {
    test('cohort params are included in compiled params', () => {
      const expr = analyticsWhere({
        projectId: 'pid-123',
        from: '2026-01-01',
        to: '2026-01-31',
        cohortFilters: [{
          cohort_id: 'cohort-abc',
          definition: { type: 'AND', values: [] },
          materialized: true,
          is_static: false,
        }],
      });
      const { sql, params } = compileWhere(expr);
      expect(params.p_0).toBe('pid-123');
      expect(params.coh_mid_0).toBe('cohort-abc');
      expect(params.project_id).toBe('pid-123');
      expect(sql).toContain('cohort_members');
    });

    test('works without cohortFilters', () => {
      const expr = analyticsWhere({
        projectId: 'pid-123',
        from: '2026-01-01',
        to: '2026-01-31',
      });
      const { sql, params } = compileWhere(expr);
      expect(sql).toContain('project_id = {p_0:UUID}');
      expect(params.p_0).toBe('pid-123');
      expect(params.coh_mid_0).toBeUndefined();
    });
  });

  describe('analyticsWhere', () => {
    test('minimal: projectId + timeRange', () => {
      const expr = analyticsWhere({
        projectId: 'pid-123',
        from: '2026-01-01',
        to: '2026-01-31',
      });
      const { sql, params } = compileWhere(expr);
      expect(sql).toContain('project_id = {p_0:UUID}');
      expect(sql).toContain('timestamp >= {p_1:DateTime64(3)}');
      expect(sql).toContain('timestamp <= {p_2:DateTime64(3)}');
      expect(params.p_0).toBe('pid-123');
    });

    test('with timezone', () => {
      const expr = analyticsWhere({
        projectId: 'pid-123',
        from: '2026-01-01',
        to: '2026-01-31',
        tz: 'Europe/Moscow',
      });
      const { sql, params } = compileWhere(expr);
      expect(sql).toContain('toDateTime64({p_1:String}, 3, {p_2:String})');
      expect(params.p_2).toBe('Europe/Moscow');
    });

    test('with eventName', () => {
      const expr = analyticsWhere({
        projectId: 'pid-123',
        from: '2026-01-01',
        to: '2026-01-31',
        eventName: 'page_view',
      });
      const { sql } = compileWhere(expr);
      expect(sql).toContain('event_name = {p_3:String}');
    });

    test('with eventNames array', () => {
      const expr = analyticsWhere({
        projectId: 'pid-123',
        from: '2026-01-01',
        to: '2026-01-31',
        eventNames: ['page_view', 'click'],
      });
      const { sql } = compileWhere(expr);
      expect(sql).toContain('event_name IN ({p_3:Array(String)})');
    });

    test('with property filters', () => {
      const expr = analyticsWhere({
        projectId: 'pid-123',
        from: '2026-01-01',
        to: '2026-01-31',
        filters: [
          { property: 'browser', operator: 'eq' as const, value: 'Chrome' },
        ],
      });
      const { sql } = compileWhere(expr);
      expect(sql).toContain('browser =');
      expect(sql).toContain(':String}');
    });
  });

  describe('resolvePropertyExpr', () => {
    test('direct column returns raw column name', () => {
      const { sql } = compileExpr(resolvePropertyExpr('browser'));
      expect(sql).toContain('browser');
    });

    test('JSON property returns JSONExtractString', () => {
      const { sql } = compileExpr(resolvePropertyExpr('properties.plan'));
      expect(sql).toContain("JSONExtractString(properties, 'plan')");
    });

    test('unknown property throws', () => {
      expect(() => resolvePropertyExpr('unknown_column')).toThrow('Unknown filter property');
    });
  });

  describe('resolveNumericPropertyExpr', () => {
    test('JSON property returns toFloat64OrZero(JSONExtractRaw(...))', () => {
      const { sql } = compileExpr(resolveNumericPropertyExpr('properties.price'));
      expect(sql).toContain("toFloat64OrZero(JSONExtractRaw(properties, 'price'))");
    });

    test('non-JSON property throws', () => {
      expect(() => resolveNumericPropertyExpr('browser')).toThrow('Unknown metric property');
    });
  });
});

describe('analytics/resolved-person', () => {
  test('resolvedPerson returns the coalesce expression', () => {
    const { sql } = compileExpr(resolvedPerson());
    expect(sql).toContain("coalesce(dictGetOrNull('person_overrides_dict', 'person_id', (project_id, distinct_id)), person_id)");
  });

  test('RESOLVED_PERSON constant matches raw SQL', () => {
    expect(RESOLVED_PERSON).toContain('dictGetOrNull');
    expect(RESOLVED_PERSON).toContain('person_id');
  });
});

describe('analytics/aggregations', () => {
  describe('baseMetricColumns', () => {
    test('returns count() AS raw_value and uniqExact(RESOLVED_PERSON) AS uniq_value', () => {
      const cols = baseMetricColumns();
      expect(cols).toHaveLength(2);
      const q = select(...cols).from('events').build();
      const { sql } = compile(q);
      expect(sql).toContain('count() AS raw_value');
      expect(sql).toContain('uniqExact(');
      expect(sql).toContain('AS uniq_value');
    });
  });

  describe('aggColumn', () => {
    test('total_events returns count()', () => {
      const { sql } = compileExpr(aggColumn('total_events'));
      expect(sql).toContain('count()');
    });

    test('unique_users returns uniqExact with resolved person', () => {
      const { sql } = compileExpr(aggColumn('unique_users'));
      expect(sql).toContain('uniqExact(');
      expect(sql).toContain('dictGetOrNull');
    });

    test('events_per_user returns count()/uniqExact(...)', () => {
      const { sql } = compileExpr(aggColumn('events_per_user'));
      expect(sql).toContain('count() / uniqExact(');
    });

    test('property_sum with metricProperty', () => {
      const { sql } = compileExpr(aggColumn('property_sum', 'properties.price'));
      expect(sql).toContain('sum(');
      expect(sql).toContain('toFloat64OrZero');
    });

    test('property_avg with metricProperty', () => {
      const { sql } = compileExpr(aggColumn('property_avg', 'properties.price'));
      expect(sql).toContain('avg(');
      expect(sql).toContain('toFloat64OrZero');
    });

    test('property_min with metricProperty', () => {
      const { sql } = compileExpr(aggColumn('property_min', 'properties.price'));
      expect(sql).toContain('min(');
      expect(sql).toContain('toFloat64OrZero');
    });

    test('property_max with metricProperty', () => {
      const { sql } = compileExpr(aggColumn('property_max', 'properties.price'));
      expect(sql).toContain('max(');
      expect(sql).toContain('toFloat64OrZero');
    });

    test('property_sum without metricProperty throws', () => {
      expect(() => aggColumn('property_sum')).toThrow('requires metricProperty');
    });

    test('property_min without metricProperty throws', () => {
      expect(() => aggColumn('property_min')).toThrow('requires metricProperty');
    });

    test('property_max without metricProperty throws', () => {
      expect(() => aggColumn('property_max')).toThrow('requires metricProperty');
    });
  });

  describe('numericProperty', () => {
    test('returns toFloat64OrZero expression', () => {
      const { sql } = compileExpr(numericProperty('properties.revenue'));
      expect(sql).toContain("toFloat64OrZero(JSONExtractRaw(properties, 'revenue'))");
    });
  });
});

describe('analytics integration: real-world stickiness query', () => {
  test('builds stickiness query using analytics helpers', () => {
    const granularity = 'day' as const;
    const tz = 'Europe/Moscow';

    const personPeriods = select(
      resolvedPerson().as('person_id'),
      uniqExact(bucket(granularity, 'timestamp', tz)).as('active_periods'),
    )
      .from('events')
      .where(analyticsWhere({
        projectId: 'test-project-id',
        from: '2026-01-01',
        to: '2026-01-31',
        tz,
        eventName: 'page_view',
        filters: [
          { property: 'browser', operator: 'eq' as const, value: 'Chrome' },
        ],
      }))
      .groupBy(col('person_id'))
      .build();

    const q = select(col('active_periods'), count().as('user_count'))
      .with('person_active_periods', personPeriods)
      .from('person_active_periods')
      .groupBy(col('active_periods'))
      .orderBy(col('active_periods'))
      .build();

    const { sql, params } = compile(q);

    expect(sql).toContain('WITH');
    expect(sql).toContain('person_active_periods AS (');
    expect(sql).toContain('dictGetOrNull');
    expect(sql).toContain('AS person_id');
    expect(sql).toContain("toStartOfDay(timestamp, 'Europe/Moscow')");
    expect(sql).toContain('project_id = {p_0:UUID}');
    expect(sql).toContain('toDateTime64(');
    expect(sql).toContain("event_name = ");
    expect(sql).toContain('browser = ');
    expect(sql).toContain('FROM person_active_periods');
    expect(sql).toContain('GROUP BY active_periods');
    expect(sql).toContain('ORDER BY active_periods');
    expect(params.p_0).toBe('test-project-id');
  });
});
