import { describe, it, expect } from 'vitest';
import type { CohortConditionGroup } from '@qurvo/db';
import { detectCircularDependency } from '../../cohort/validation';

/**
 * Builds a simple CohortConditionGroup that references the given cohort IDs.
 */
function makeDefinition(cohortRefs: string[]): CohortConditionGroup {
  return {
    type: 'AND',
    values: cohortRefs.map((id) => ({
      type: 'cohort' as const,
      cohort_id: id,
      negated: false,
    })),
  };
}

/**
 * Builds a resolver from a plain map of cohortId → referenced cohort IDs.
 */
function makeResolver(
  graph: Record<string, string[]>,
): (id: string) => Promise<CohortConditionGroup | null> {
  return async (id: string) => {
    if (id in graph) {
      return makeDefinition(graph[id]);
    }
    return null;
  };
}

describe('detectCircularDependency', () => {
  it('returns false when there are no references', async () => {
    const resolve = makeResolver({});
    const def = makeDefinition([]);
    expect(await detectCircularDependency('A', def, resolve)).toBe(false);
  });

  it('returns false for a simple linear chain A → B → C', async () => {
    const resolve = makeResolver({ B: ['C'], C: [] });
    const def = makeDefinition(['B']);
    expect(await detectCircularDependency('A', def, resolve)).toBe(false);
  });

  it('detects a direct self-reference A → A', async () => {
    const resolve = makeResolver({ A: ['A'] });
    const def = makeDefinition(['A']);
    expect(await detectCircularDependency('A', def, resolve)).toBe(true);
  });

  it('detects a two-node cycle A → B → A', async () => {
    const resolve = makeResolver({ B: ['A'] });
    const def = makeDefinition(['B']);
    expect(await detectCircularDependency('A', def, resolve)).toBe(true);
  });

  it('detects a longer cycle A → B → C → A', async () => {
    const resolve = makeResolver({ B: ['C'], C: ['A'] });
    const def = makeDefinition(['B']);
    expect(await detectCircularDependency('A', def, resolve)).toBe(true);
  });

  it('diamond: A → {B, C}, B → D, C → D — no false positive cycle', async () => {
    // D is reachable via two different paths (through B and through C).
    // The old global-visited approach incorrectly detected this as a cycle.
    const resolve = makeResolver({ B: ['D'], C: ['D'], D: [] });
    const def = makeDefinition(['B', 'C']);
    expect(await detectCircularDependency('A', def, resolve)).toBe(false);
  });

  it('diamond with deeper nesting: A → {B, C}, B → {D, E}, C → {D, E} — no false positive', async () => {
    const resolve = makeResolver({
      B: ['D', 'E'],
      C: ['D', 'E'],
      D: [],
      E: [],
    });
    const def = makeDefinition(['B', 'C']);
    expect(await detectCircularDependency('A', def, resolve)).toBe(false);
  });

  it('real cycle inside diamond: A → {B, C}, B → D, C → D, D → A — detects cycle', async () => {
    // D eventually points back to A, so there is a real cycle even in a diamond shape.
    const resolve = makeResolver({ B: ['D'], C: ['D'], D: ['A'] });
    const def = makeDefinition(['B', 'C']);
    expect(await detectCircularDependency('A', def, resolve)).toBe(true);
  });

  it('returns false when a referenced cohort does not exist in store', async () => {
    // resolveDefinition returns null for unknown cohorts — they are simply ignored.
    const resolve = makeResolver({});
    const def = makeDefinition(['unknown-cohort']);
    expect(await detectCircularDependency('A', def, resolve)).toBe(false);
  });
});
