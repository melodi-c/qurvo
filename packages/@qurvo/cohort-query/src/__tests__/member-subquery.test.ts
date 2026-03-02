import { describe, it, expect } from 'vitest';
import { buildCohortMemberSubquery } from '../builder';
import { compile } from '@qurvo/ch-query';
import type { CohortFilterInput } from '../types';
import type { CohortConditionGroup } from '@qurvo/db';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';
const COHORT_ID = '22222222-2222-2222-2222-222222222222';

const simpleDef: CohortConditionGroup = {
  type: 'AND',
  values: [
    { type: 'person_property', property: 'user_properties.plan', operator: 'eq', value: 'pro' },
  ],
};

describe('buildCohortMemberSubquery', () => {
  it('static cohort -> person_static_cohort FINAL', () => {
    const input: CohortFilterInput = {
      cohort_id: COHORT_ID,
      definition: simpleDef,
      materialized: false,
      is_static: true,
    };
    const node = buildCohortMemberSubquery(input, 'coh_sid_0', 'project_id', PROJECT_ID);
    const { sql, params } = compile(node);

    expect(sql).toContain('person_static_cohort FINAL');
    expect(sql).toContain('{coh_sid_0:UUID}');
    expect(sql).toContain('{project_id:UUID}');
    expect(sql).not.toContain('cohort_members');
    expect(sql).not.toContain('events');
    expect(params['coh_sid_0']).toBe(COHORT_ID);
  });

  it('materialized cohort -> cohort_members FINAL', () => {
    const input: CohortFilterInput = {
      cohort_id: COHORT_ID,
      definition: simpleDef,
      materialized: true,
      is_static: false,
    };
    const node = buildCohortMemberSubquery(input, 'coh_mid_0', 'project_id', PROJECT_ID);
    const { sql, params } = compile(node);

    expect(sql).toContain('cohort_members FINAL');
    expect(sql).toContain('{coh_mid_0:UUID}');
    expect(sql).toContain('{project_id:UUID}');
    expect(sql).not.toContain('person_static_cohort');
    expect(sql).not.toContain('events');
    expect(params['coh_mid_0']).toBe(COHORT_ID);
  });

  it('inline cohort -> delegates to buildCohortSubquery (events table)', () => {
    const input: CohortFilterInput = {
      cohort_id: COHORT_ID,
      definition: simpleDef,
      materialized: false,
      is_static: false,
    };
    const node = buildCohortMemberSubquery(input, 'coh_inline_0', 'project_id', PROJECT_ID);
    const { sql, params } = compile(node);

    // Inline cohort queries the events table
    expect(sql).toContain('events');
    expect(sql).toContain('person_id');
    expect(sql).not.toContain('cohort_members FINAL');
    expect(sql).not.toContain('person_static_cohort FINAL');
    // The cohort_id param should NOT be set for inline cohorts
    expect(params['coh_inline_0']).toBeUndefined();
  });

  it('is_static takes priority over materialized', () => {
    // Edge case: both flags set -- is_static should win
    const input: CohortFilterInput = {
      cohort_id: COHORT_ID,
      definition: simpleDef,
      materialized: true,
      is_static: true,
    };
    const node = buildCohortMemberSubquery(input, 'coh_param', 'project_id', PROJECT_ID);
    const { sql } = compile(node);

    expect(sql).toContain('person_static_cohort FINAL');
    expect(sql).not.toContain('cohort_members FINAL');
  });

  it('inline cohort passes dateTo and dateFrom to buildCohortSubquery', () => {
    // Use not_performed_event condition which uses both dateTo and dateFrom
    const defWithNotPerformed: CohortConditionGroup = {
      type: 'AND',
      values: [
        { type: 'not_performed_event', event_name: 'purchase', time_window_days: 30 },
      ],
    };
    const input: CohortFilterInput = {
      cohort_id: COHORT_ID,
      definition: defWithNotPerformed,
      materialized: false,
      is_static: false,
    };
    const node = buildCohortMemberSubquery(
      input, 'coh_0', 'project_id', PROJECT_ID, 0,
      undefined, '2025-01-31 23:59:59', '2025-01-01 00:00:00',
    );
    const { sql, params } = compile(node);

    expect(sql).toContain('events');
    // not_performed_event uses both date bounds via namedParam
    expect(params['coh_date_to']).toBe('2025-01-31 23:59:59');
    expect(params['coh_date_from']).toBe('2025-01-01 00:00:00');
  });

  it('subqueryOffset controls param counter for inline cohort', () => {
    const input: CohortFilterInput = {
      cohort_id: COHORT_ID,
      definition: simpleDef,
      materialized: false,
      is_static: false,
    };

    const node0 = buildCohortMemberSubquery(input, 'k0', 'project_id', PROJECT_ID, 0);
    const node5 = buildCohortMemberSubquery(input, 'k5', 'project_id', PROJECT_ID, 5);

    const { params: params0 } = compile(node0);
    const { params: params5 } = compile(node5);

    // offset=0 generates coh_0_... params, offset=5 generates coh_500_... params
    const keys0 = Object.keys(params0).filter((k) => k.startsWith('coh_'));
    const keys5 = Object.keys(params5).filter((k) => k.startsWith('coh_'));

    // Different offsets -> different param keys (no collision)
    const overlap = keys0.filter((k) => keys5.includes(k));
    expect(overlap).toEqual([]);
  });
});
