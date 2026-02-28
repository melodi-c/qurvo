import { describe, it, expect } from 'vitest';
import { topologicalSortCohorts, groupCohortsByLevel, type CohortForSort } from '../toposort';
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

  it('mixed graph: valid chain A→B and cycle C↔D → sorted=[A,B], cyclic=[C,D]', () => {
    // A depends on B (valid chain), C and D form a mutual cycle
    const cohorts = [
      makeCohort('A', ['B']),
      makeCohort('B'),
      makeCohort('C', ['D']),
      makeCohort('D', ['C']),
    ];
    const { sorted, cyclic } = topologicalSortCohorts(cohorts);
    // Valid cohorts must be present in sorted, in dependency order (B before A)
    expect(sorted.map((c) => c.id).sort()).toEqual(['A', 'B']);
    expect(sorted.map((c) => c.id).indexOf('B')).toBeLessThan(
      sorted.map((c) => c.id).indexOf('A'),
    );
    // Cyclic cohorts must be isolated
    expect(cyclic.sort()).toEqual(['C', 'D']);
  });
});

describe('groupCohortsByLevel', () => {
  it('empty input → empty output', () => {
    expect(groupCohortsByLevel([])).toEqual([]);
  });

  it('no dependencies → single level', () => {
    const sorted = [makeCohort('A'), makeCohort('B'), makeCohort('C')];
    const levels = groupCohortsByLevel(sorted);
    expect(levels).toHaveLength(1);
    expect(levels[0].map((c) => c.id)).toEqual(['A', 'B', 'C']);
  });

  it('linear chain → one node per level', () => {
    // Sorted order after toposort: C, B, A (C has no deps, B depends on C, A on B)
    const { sorted } = topologicalSortCohorts([
      makeCohort('A', ['B']),
      makeCohort('B', ['C']),
      makeCohort('C'),
    ]);
    const levels = groupCohortsByLevel(sorted);
    expect(levels).toHaveLength(3);
    expect(levels[0].map((c) => c.id)).toEqual(['C']);
    expect(levels[1].map((c) => c.id)).toEqual(['B']);
    expect(levels[2].map((c) => c.id)).toEqual(['A']);
  });

  it('diamond → D at level 0, B+C at level 1, A at level 2', () => {
    const { sorted } = topologicalSortCohorts([
      makeCohort('A', ['B', 'C']),
      makeCohort('B', ['D']),
      makeCohort('C', ['D']),
      makeCohort('D'),
    ]);
    const levels = groupCohortsByLevel(sorted);
    expect(levels).toHaveLength(3);
    expect(levels[0].map((c) => c.id)).toEqual(['D']);
    expect(levels[1].map((c) => c.id).sort()).toEqual(['B', 'C']);
    expect(levels[2].map((c) => c.id)).toEqual(['A']);
  });
});
