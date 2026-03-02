import { describe, it, expect } from 'vitest';
import { buildCohortRefConditionSubquery } from '../conditions/cohort-ref';
import { compile } from '@qurvo/ch-query';
import type { BuildContext } from '../types';
import type { CohortCohortCondition } from '@qurvo/db';

function makeCtx(overrides?: Partial<BuildContext>): BuildContext {
  return {
    projectIdParam: 'pid',
    projectId: 'test-project-id',
    counter: { value: 0 },
    ...overrides,
  };
}

/** Extract compiled params from a node */
function params(node: ReturnType<typeof buildCohortRefConditionSubquery>) {
  return compile(node).params;
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
    const sql = compile(buildCohortRefConditionSubquery(BASE_COND, ctx)).sql;

    expect(sql).toContain('cohort_members');
    expect(sql).not.toContain('FROM events');
  });

  it('non-negated static: returns person_static_cohort subquery without events scan', () => {
    const ctx = makeCtx();
    const sql = compile(buildCohortRefConditionSubquery({ ...BASE_COND, is_static: true }, ctx)).sql;

    expect(sql).toContain('person_static_cohort');
    expect(sql).not.toContain('FROM events');
  });

  it('negated (no dates): upper bound is now64(3), no lower bound', () => {
    const ctx = makeCtx();
    const sql = compile(buildCohortRefConditionSubquery({ ...BASE_COND, negated: true }, ctx)).sql;

    expect(sql).toContain('FROM events');
    expect(sql).toContain('NOT IN');
    expect(sql).toContain('cohort_members');
    expect(sql).toContain('timestamp <= now64(3)');
    // No lower bound when dateFrom is not set
    expect(sql).not.toContain('timestamp >= now64(3)');
  });

  it('negated with dateTo only: upper bound only, no lower bound', () => {
    const ctx = makeCtx({ dateTo: '2025-01-31 23:59:59' });
    const node = buildCohortRefConditionSubquery({ ...BASE_COND, negated: true }, ctx);
    const { sql, params: p } = compile(node);

    expect(sql).toContain('timestamp <= {coh_date_to:DateTime64(3)}');
    expect(sql).not.toContain('timestamp >= {coh_date_to:DateTime64(3)}');
    expect(p['coh_date_to']).toBe('2025-01-31 23:59:59');
  });

  it('negated with dateFrom + dateTo: uses exact [dateFrom, dateTo] window', () => {
    const ctx = makeCtx({ dateTo: '2025-01-31 23:59:59', dateFrom: '2025-01-01 00:00:00' });
    const node = buildCohortRefConditionSubquery({ ...BASE_COND, negated: true }, ctx);
    const { sql, params: p } = compile(node);

    expect(sql).toContain('timestamp >= {coh_date_from:DateTime64(3)}');
    expect(sql).toContain('timestamp <= {coh_date_to:DateTime64(3)}');
    expect(p['coh_date_from']).toBe('2025-01-01 00:00:00');
    expect(p['coh_date_to']).toBe('2025-01-31 23:59:59');
  });

  it('negated: SQL does NOT scan without a timestamp bound (regression guard)', () => {
    const ctx = makeCtx({ dateTo: '2025-06-30 23:59:59', dateFrom: '2025-06-01 00:00:00' });
    const sql = compile(buildCohortRefConditionSubquery({ ...BASE_COND, negated: true }, ctx)).sql;

    expect(sql).toContain('timestamp >=');
    expect(sql).toContain('timestamp <=');
  });

  it('negated static cohort: references person_static_cohort in NOT IN subquery', () => {
    const ctx = makeCtx({ dateTo: '2025-01-31 23:59:59', dateFrom: '2025-01-01 00:00:00' });
    const sql = compile(buildCohortRefConditionSubquery(
      { ...BASE_COND, negated: true, is_static: true },
      ctx,
    )).sql;

    expect(sql).toContain('person_static_cohort');
    expect(sql).toContain('NOT IN');
    expect(sql).toContain('timestamp >= {coh_date_from:DateTime64(3)}');
    expect(sql).toContain('timestamp <= {coh_date_to:DateTime64(3)}');
  });

  it('negated: cohort_id param stored with correct value', () => {
    const ctx = makeCtx();
    const node = buildCohortRefConditionSubquery({ ...BASE_COND, negated: true }, ctx);
    const p = params(node);

    expect(p['coh_0_ref_id']).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  });
});
