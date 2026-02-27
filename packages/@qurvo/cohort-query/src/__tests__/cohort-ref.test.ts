import { describe, it, expect } from 'vitest';
import { buildCohortRefConditionSubquery } from '../conditions/cohort-ref';
import type { BuildContext } from '../types';
import type { CohortCohortCondition } from '@qurvo/db';

function makeCtx(overrides?: Partial<BuildContext>): BuildContext {
  return {
    projectIdParam: 'pid',
    queryParams: { pid: 'test-project-id' },
    counter: { value: 0 },
    ...overrides,
  };
}

const BASE_COND: CohortCohortCondition = {
  type: 'cohort',
  cohort_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  negated: false,
  is_static: false,
};

describe('buildCohortRefConditionSubquery — negated branch timestamp bounds', () => {
  it('non-negated: returns cohort_members subquery without events scan', () => {
    const ctx = makeCtx();
    const sql = buildCohortRefConditionSubquery(BASE_COND, ctx);

    expect(sql).toContain('cohort_members');
    expect(sql).not.toContain('FROM events');
  });

  it('non-negated static: returns person_static_cohort subquery without events scan', () => {
    const ctx = makeCtx();
    const sql = buildCohortRefConditionSubquery({ ...BASE_COND, is_static: true }, ctx);

    expect(sql).toContain('person_static_cohort');
    expect(sql).not.toContain('FROM events');
  });

  it('negated (no dates): includes timestamp bounds using now64(3)', () => {
    const ctx = makeCtx();
    const sql = buildCohortRefConditionSubquery({ ...BASE_COND, negated: true }, ctx);

    // Must scan events table
    expect(sql).toContain('FROM events');
    // Must include NOT IN subquery against cohort_members
    expect(sql).toContain('NOT IN');
    expect(sql).toContain('cohort_members');
    // Both timestamp bounds must be present (prevents full-history scan)
    expect(sql).toContain('timestamp >= now64(3)');
    expect(sql).toContain('timestamp <= now64(3)');
  });

  it('negated with dateTo only: uses {coh_date_to:DateTime64(3)} for both bounds', () => {
    const ctx = makeCtx({ dateTo: '2025-01-31 23:59:59' });
    const sql = buildCohortRefConditionSubquery({ ...BASE_COND, negated: true }, ctx);

    expect(sql).toContain('timestamp >= {coh_date_to:DateTime64(3)}');
    expect(sql).toContain('timestamp <= {coh_date_to:DateTime64(3)}');
    // Param must be stored
    expect(ctx.queryParams['coh_date_to']).toBe('2025-01-31 23:59:59');
  });

  it('negated with dateFrom + dateTo: uses exact [dateFrom, dateTo] window', () => {
    const ctx = makeCtx({ dateTo: '2025-01-31 23:59:59', dateFrom: '2025-01-01 00:00:00' });
    const sql = buildCohortRefConditionSubquery({ ...BASE_COND, negated: true }, ctx);

    // Lower bound: dateFrom
    expect(sql).toContain('timestamp >= {coh_date_from:DateTime64(3)}');
    // Upper bound: dateTo
    expect(sql).toContain('timestamp <= {coh_date_to:DateTime64(3)}');
    // Both params stored
    expect(ctx.queryParams['coh_date_from']).toBe('2025-01-01 00:00:00');
    expect(ctx.queryParams['coh_date_to']).toBe('2025-01-31 23:59:59');
  });

  it('negated: SQL does NOT scan without a timestamp bound (regression guard)', () => {
    // Ensure there is always a timestamp clause — no unbounded full-history scan
    const ctx = makeCtx({ dateTo: '2025-06-30 23:59:59', dateFrom: '2025-06-01 00:00:00' });
    const sql = buildCohortRefConditionSubquery({ ...BASE_COND, negated: true }, ctx);

    // Both bounds present
    expect(sql).toContain('AND timestamp >=');
    expect(sql).toContain('AND timestamp <=');
  });

  it('negated static cohort: references person_static_cohort in NOT IN subquery', () => {
    const ctx = makeCtx({ dateTo: '2025-01-31 23:59:59', dateFrom: '2025-01-01 00:00:00' });
    const sql = buildCohortRefConditionSubquery(
      { ...BASE_COND, negated: true, is_static: true },
      ctx,
    );

    expect(sql).toContain('person_static_cohort');
    expect(sql).toContain('NOT IN');
    expect(sql).toContain('timestamp >= {coh_date_from:DateTime64(3)}');
    expect(sql).toContain('timestamp <= {coh_date_to:DateTime64(3)}');
  });

  it('negated: cohort_id param stored with correct value', () => {
    const ctx = makeCtx();
    buildCohortRefConditionSubquery({ ...BASE_COND, negated: true }, ctx);

    expect(ctx.queryParams['coh_0_ref_id']).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  });
});
