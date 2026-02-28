import { describe, it, expect } from 'vitest';
import type { CohortConditionGroup, CohortCondition } from '@qurvo/db';
import {
  countLeafConditions,
  measureNestingDepth,
  validateDefinitionComplexity,
  MAX_TOTAL_CONDITIONS,
  MAX_NESTING_DEPTH,
  detectCircularDependency,
} from '../../cohort/validation';
import { CohortQueryValidationError } from '../../cohort/errors';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeLeaf(overrides?: Partial<CohortCondition>): CohortCondition {
  return {
    type: 'person_property',
    property: 'user_properties.plan',
    operator: 'eq',
    value: 'premium',
    ...overrides,
  } as CohortCondition;
}

function makeGroup(
  type: 'AND' | 'OR',
  values: (CohortCondition | CohortConditionGroup)[],
): CohortConditionGroup {
  return { type, values };
}

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

// ── countLeafConditions ──────────────────────────────────────────────────────

describe('countLeafConditions', () => {
  it('counts a flat group with leaf conditions only', () => {
    const group = makeGroup('AND', [makeLeaf(), makeLeaf(), makeLeaf()]);
    expect(countLeafConditions(group)).toBe(3);
  });

  it('returns 0 for an empty group', () => {
    const group = makeGroup('AND', []);
    expect(countLeafConditions(group)).toBe(0);
  });

  it('counts through nested groups recursively', () => {
    // 2 leaves + nested group with 3 leaves = 5 total
    const inner = makeGroup('OR', [makeLeaf(), makeLeaf(), makeLeaf()]);
    const outer = makeGroup('AND', [makeLeaf(), makeLeaf(), inner]);
    expect(countLeafConditions(outer)).toBe(5);
  });

  it('counts deeply nested groups (3 levels)', () => {
    // level 3: 2 leaves
    const level3 = makeGroup('AND', [makeLeaf(), makeLeaf()]);
    // level 2: 1 leaf + level3 = 3 leaves
    const level2 = makeGroup('OR', [makeLeaf(), level3]);
    // level 1: 1 leaf + level2 = 4 leaves
    const level1 = makeGroup('AND', [makeLeaf(), level2]);
    expect(countLeafConditions(level1)).toBe(4);
  });

  it('counts multiple nested groups at the same level', () => {
    const sub1 = makeGroup('OR', [makeLeaf(), makeLeaf()]);
    const sub2 = makeGroup('OR', [makeLeaf(), makeLeaf(), makeLeaf()]);
    const root = makeGroup('AND', [sub1, sub2, makeLeaf()]);
    // 2 + 3 + 1 = 6
    expect(countLeafConditions(root)).toBe(6);
  });
});

// ── measureNestingDepth ──────────────────────────────────────────────────────

describe('measureNestingDepth', () => {
  it('returns 1 for a flat group (no nested groups)', () => {
    const group = makeGroup('AND', [makeLeaf(), makeLeaf()]);
    expect(measureNestingDepth(group)).toBe(1);
  });

  it('returns 1 for an empty group', () => {
    const group = makeGroup('AND', []);
    expect(measureNestingDepth(group)).toBe(1);
  });

  it('returns 2 for one level of nesting', () => {
    const inner = makeGroup('OR', [makeLeaf()]);
    const outer = makeGroup('AND', [inner]);
    expect(measureNestingDepth(outer)).toBe(2);
  });

  it('returns 3 for two levels of nesting', () => {
    const l3 = makeGroup('AND', [makeLeaf()]);
    const l2 = makeGroup('OR', [l3]);
    const l1 = makeGroup('AND', [l2]);
    expect(measureNestingDepth(l1)).toBe(3);
  });

  it('takes the maximum branch depth when siblings have different depths', () => {
    const shallow = makeGroup('OR', [makeLeaf()]); // depth 1
    const deep = makeGroup('OR', [makeGroup('AND', [makeLeaf()])]); // depth 2
    const root = makeGroup('AND', [shallow, deep]); // 1 + max(1, 2) = 3
    expect(measureNestingDepth(root)).toBe(3);
  });
});

// ── validateDefinitionComplexity ─────────────────────────────────────────────

describe('validateDefinitionComplexity', () => {
  it('does not throw for a definition with exactly MAX_TOTAL_CONDITIONS leaf conditions', () => {
    const leaves = Array.from({ length: MAX_TOTAL_CONDITIONS }, () => makeLeaf());
    const group = makeGroup('AND', leaves);
    expect(() => validateDefinitionComplexity(group)).not.toThrow();
  });

  it('throws CohortQueryValidationError when leaf conditions exceed MAX_TOTAL_CONDITIONS', () => {
    const leaves = Array.from({ length: MAX_TOTAL_CONDITIONS + 1 }, () => makeLeaf());
    const group = makeGroup('AND', leaves);
    expect(() => validateDefinitionComplexity(group)).toThrow(CohortQueryValidationError);
    expect(() => validateDefinitionComplexity(group)).toThrow(
      /exceeds the maximum of 50/,
    );
  });

  it('throws when nested groups combine to exceed MAX_TOTAL_CONDITIONS', () => {
    // 10 groups x 6 leaves each = 60 > 50
    const subgroups = Array.from({ length: 10 }, () =>
      makeGroup('OR', Array.from({ length: 6 }, () => makeLeaf())),
    );
    const root = makeGroup('AND', subgroups);
    expect(countLeafConditions(root)).toBe(60);
    expect(() => validateDefinitionComplexity(root)).toThrow(CohortQueryValidationError);
  });

  it('does not throw for a legitimate definition with 20 conditions', () => {
    const leaves = Array.from({ length: 20 }, () => makeLeaf());
    const group = makeGroup('AND', leaves);
    expect(() => validateDefinitionComplexity(group)).not.toThrow();
  });

  it('does not throw for nesting depth exactly at MAX_NESTING_DEPTH', () => {
    // Build a chain of depth exactly MAX_NESTING_DEPTH
    let current: CohortConditionGroup = makeGroup('AND', [makeLeaf()]);
    for (let i = 1; i < MAX_NESTING_DEPTH; i++) {
      current = makeGroup('AND', [current]);
    }
    expect(measureNestingDepth(current)).toBe(MAX_NESTING_DEPTH);
    expect(() => validateDefinitionComplexity(current)).not.toThrow();
  });

  it('throws CohortQueryValidationError when nesting depth exceeds MAX_NESTING_DEPTH', () => {
    // Build a chain of depth MAX_NESTING_DEPTH + 1
    let current: CohortConditionGroup = makeGroup('AND', [makeLeaf()]);
    for (let i = 0; i < MAX_NESTING_DEPTH; i++) {
      current = makeGroup('AND', [current]);
    }
    expect(measureNestingDepth(current)).toBe(MAX_NESTING_DEPTH + 1);
    expect(() => validateDefinitionComplexity(current)).toThrow(CohortQueryValidationError);
    expect(() => validateDefinitionComplexity(current)).toThrow(
      /exceeds the maximum of 4/,
    );
  });

  it('passes for a realistic definition: 2 nested OR groups with 5 conditions each', () => {
    const or1 = makeGroup('OR', Array.from({ length: 5 }, () => makeLeaf()));
    const or2 = makeGroup('OR', Array.from({ length: 5 }, () => makeLeaf()));
    const root = makeGroup('AND', [or1, or2]);
    // 10 leaves, depth 2 - well within limits
    expect(() => validateDefinitionComplexity(root)).not.toThrow();
  });
});

// ── detectCircularDependency ─────────────────────────────────────────────────

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
