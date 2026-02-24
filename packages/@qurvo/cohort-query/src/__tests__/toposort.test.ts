import { describe, it, expect } from 'vitest';
import { topologicalSortCohorts, type CohortForSort } from '../toposort';
import type { CohortConditionGroup } from '@qurvo/db';

function makeCohort(id: string, cohortRefs: string[] = []): CohortForSort {
  const definition: CohortConditionGroup = {
    type: 'AND',
    values: cohortRefs.map((refId) => ({
      type: 'cohort' as const,
      cohort_id: refId,
      negated: false,
    })),
  };
  return { id, definition };
}

describe('topologicalSortCohorts', () => {
  it('empty input → empty output', () => {
    const { sorted, cyclic } = topologicalSortCohorts([]);
    expect(sorted).toEqual([]);
    expect(cyclic).toEqual([]);
  });

  it('no dependencies → preserves order', () => {
    const cohorts = [makeCohort('A'), makeCohort('B'), makeCohort('C')];
    const { sorted, cyclic } = topologicalSortCohorts(cohorts);
    expect(sorted.map((c) => c.id)).toEqual(['A', 'B', 'C']);
    expect(cyclic).toEqual([]);
  });

  it('linear chain A→B→C → C, B, A', () => {
    // A depends on B, B depends on C
    const cohorts = [makeCohort('A', ['B']), makeCohort('B', ['C']), makeCohort('C')];
    const { sorted, cyclic } = topologicalSortCohorts(cohorts);
    const order = sorted.map((c) => c.id);
    // C must come before B, B must come before A
    expect(order.indexOf('C')).toBeLessThan(order.indexOf('B'));
    expect(order.indexOf('B')).toBeLessThan(order.indexOf('A'));
    expect(cyclic).toEqual([]);
  });

  it('diamond: A→{B,C}, B→D, C→D → D first', () => {
    const cohorts = [
      makeCohort('A', ['B', 'C']),
      makeCohort('B', ['D']),
      makeCohort('C', ['D']),
      makeCohort('D'),
    ];
    const { sorted, cyclic } = topologicalSortCohorts(cohorts);
    const order = sorted.map((c) => c.id);
    expect(order.indexOf('D')).toBeLessThan(order.indexOf('B'));
    expect(order.indexOf('D')).toBeLessThan(order.indexOf('C'));
    expect(order.indexOf('B')).toBeLessThan(order.indexOf('A'));
    expect(order.indexOf('C')).toBeLessThan(order.indexOf('A'));
    expect(cyclic).toEqual([]);
  });

  it('reference to cohort not in the set → ignored', () => {
    // A references "external" which is not in the input
    const cohorts = [makeCohort('A', ['external']), makeCohort('B')];
    const { sorted, cyclic } = topologicalSortCohorts(cohorts);
    expect(sorted.map((c) => c.id)).toEqual(['A', 'B']);
    expect(cyclic).toEqual([]);
  });

  it('detects cycles', () => {
    const cohorts = [makeCohort('A', ['B']), makeCohort('B', ['A'])];
    const { sorted, cyclic } = topologicalSortCohorts(cohorts);
    expect(sorted).toEqual([]);
    expect(cyclic.sort()).toEqual(['A', 'B']);
  });
});
