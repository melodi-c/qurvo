import type { CohortCondition, CohortConditionGroup } from '@qurvo/db';
import { isConditionGroup } from '@qurvo/db';
import { CohortQueryValidationError } from './errors';

/**
 * Maximum total number of leaf conditions allowed across all nesting levels.
 * Each per-level `@ArrayMaxSize(20)` allows 20 items, but recursive nesting
 * could produce 20^N conditions. This constant caps the *total* leaf count
 * to prevent ClickHouse query explosion (each leaf = one subquery via
 * INTERSECT / UNION ALL).
 */
export const MAX_TOTAL_CONDITIONS = 50;

/**
 * Maximum nesting depth for condition groups.
 * Prevents deeply nested definitions that would produce extremely deep
 * SQL subquery chains even if the total leaf count stays below the limit.
 */
export const MAX_NESTING_DEPTH = 4;

/**
 * Recursively counts the total number of leaf conditions (non-group nodes)
 * inside a definition tree. Used to enforce `MAX_TOTAL_CONDITIONS` before
 * building a ClickHouse query.
 */
export function countLeafConditions(group: CohortConditionGroup): number {
  let total = 0;
  for (const val of group.values) {
    if (isConditionGroup(val)) {
      total += countLeafConditions(val);
    } else {
      total += 1;
    }
  }
  return total;
}

/**
 * Returns the maximum nesting depth of condition groups.
 * A flat group (no nested groups) has depth 1.
 */
export function measureNestingDepth(group: CohortConditionGroup): number {
  let maxChild = 0;
  for (const val of group.values) {
    if (isConditionGroup(val)) {
      const childDepth = measureNestingDepth(val);
      if (childDepth > maxChild) maxChild = childDepth;
    }
  }
  return 1 + maxChild;
}

/**
 * Validates that a cohort definition does not exceed complexity limits.
 * Throws `CohortQueryValidationError` if limits are exceeded.
 *
 * Checks:
 * 1. Total leaf conditions <= MAX_TOTAL_CONDITIONS (50)
 * 2. Nesting depth <= MAX_NESTING_DEPTH (4)
 */
export function validateDefinitionComplexity(definition: CohortConditionGroup): void {
  const leafCount = countLeafConditions(definition);
  if (leafCount > MAX_TOTAL_CONDITIONS) {
    throw new CohortQueryValidationError(
      `Cohort definition contains ${leafCount} conditions, which exceeds the maximum of ${MAX_TOTAL_CONDITIONS}. ` +
      `Simplify the definition by reducing the number of conditions or nesting levels.`,
    );
  }

  const depth = measureNestingDepth(definition);
  if (depth > MAX_NESTING_DEPTH) {
    throw new CohortQueryValidationError(
      `Cohort definition has nesting depth ${depth}, which exceeds the maximum of ${MAX_NESTING_DEPTH}. ` +
      `Flatten the condition groups to reduce nesting.`,
    );
  }
}

/**
 * Extracts all cohort_id references from a definition (recursive).
 */
export function extractCohortReferences(group: CohortConditionGroup): string[] {
  const ids: string[] = [];

  function walk(node: CohortCondition | CohortConditionGroup): void {
    if (isConditionGroup(node)) {
      for (const child of node.values) {
        walk(child);
      }
    } else if (node.type === 'cohort') {
      ids.push(node.cohort_id);
    }
  }

  for (const val of group.values) {
    walk(val);
  }

  return ids;
}

/**
 * Detects circular dependency among cohorts.
 * @param cohortId - The cohort being edited
 * @param definition - Its proposed definition
 * @param resolveDefinition - Resolves a referenced cohort_id to its definition (for recursive check)
 * @returns true if a circular dependency is detected
 */
export async function detectCircularDependency(
  cohortId: string,
  definition: CohortConditionGroup,
  resolveDefinition: (id: string) => Promise<CohortConditionGroup | null>,
): Promise<boolean> {
  // ancestors tracks the current DFS path, not all visited nodes globally.
  // A node is only a cycle if it appears in the current call stack (ancestor path),
  // not merely because it was visited via a different branch (diamond dependency).
  const ancestors = new Set<string>([cohortId]);

  async function check(def: CohortConditionGroup, currentAncestors: Set<string>): Promise<boolean> {
    const refs = extractCohortReferences(def);
    for (const refId of refs) {
      if (currentAncestors.has(refId)) return true;

      const refDef = await resolveDefinition(refId);
      if (refDef) {
        // Pass a new Set that extends the current path — do not mutate the shared set.
        const nextAncestors = new Set<string>(currentAncestors);
        nextAncestors.add(refId);
        if (await check(refDef, nextAncestors)) return true;
      }
    }
    return false;
  }

  return check(definition, ancestors);
}
