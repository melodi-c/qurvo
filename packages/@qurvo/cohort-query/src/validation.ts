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
  const visited = new Set<string>();
  visited.add(cohortId);

  async function check(def: CohortConditionGroup): Promise<boolean> {
    const refs = extractCohortReferences(def);
    for (const refId of refs) {
      if (visited.has(refId)) return true;
      visited.add(refId);

      const refDef = await resolveDefinition(refId);
      if (refDef && await check(refDef)) return true;
    }
    return false;
  }

  return check(definition);
}
