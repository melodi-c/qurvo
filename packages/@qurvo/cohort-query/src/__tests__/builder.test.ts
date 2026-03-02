import { describe, it, expect } from 'vitest';
import { buildCohortSubquery } from '../builder';
import { compile } from '@qurvo/ch-query';
import type { CohortConditionGroup } from '@qurvo/db';

describe('buildCohortSubquery — empty group', () => {
  it('empty root group returns UUID-typed empty result set (no String literal)', () => {
    const group: CohortConditionGroup = { type: 'AND', values: [] };
    const node = buildCohortSubquery(group, 0, 'proj', 'some-project-id');
    const sql = compile(node).sql;
    // Must use toUUID(...) so ClickHouse infers UUID column type, not String.
    expect(sql).toContain(`toUUID('00000000-0000-0000-0000-000000000000')`);
    expect(sql).toContain('person_id');
    expect(sql).toContain('WHERE 0');
  });

  it('empty nested group inside AND group also returns UUID-typed empty result', () => {
    const inner: CohortConditionGroup = { type: 'OR', values: [] };
    const outer: CohortConditionGroup = {
      type: 'AND',
      values: [
        inner,
        {
          type: 'person_property',
          property: 'user_properties.plan',
          operator: 'eq',
          value: 'pro',
        },
      ],
    };
    const node = buildCohortSubquery(outer, 0, 'proj', 'some-project-id');
    const sql = compile(node).sql;
    // The inner empty-OR subquery must use toUUID(...) not '' to avoid INTERSECT type mismatch.
    expect(sql).toContain(`toUUID('00000000-0000-0000-0000-000000000000')`);
    expect(sql).not.toContain(`SELECT '' AS person_id`);
    // Outer AND group joins with INTERSECT
    expect(sql).toContain('INTERSECT');
  });

  it('empty OR group inside UNION DISTINCT does not produce String literal', () => {
    const inner: CohortConditionGroup = { type: 'AND', values: [] };
    const outer: CohortConditionGroup = {
      type: 'OR',
      values: [
        inner,
        {
          type: 'person_property',
          property: 'user_properties.role',
          operator: 'eq',
          value: 'admin',
        },
      ],
    };
    const node = buildCohortSubquery(outer, 0, 'proj', 'some-project-id');
    const sql = compile(node).sql;
    expect(sql).toContain(`toUUID('00000000-0000-0000-0000-000000000000')`);
    expect(sql).not.toContain(`SELECT '' AS person_id`);
    // Outer OR group joins with UNION DISTINCT
    expect(sql).toContain('UNION DISTINCT');
  });
});
