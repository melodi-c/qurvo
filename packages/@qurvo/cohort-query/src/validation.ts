import type { CohortCondition, CohortConditionGroup } from '@qurvo/db';
import { isConditionGroup } from '@qurvo/db';

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
