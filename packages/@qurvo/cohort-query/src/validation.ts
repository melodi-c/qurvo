import type { CohortCondition, CohortConditionGroup, CohortDefinitionV2 } from '@qurvo/db';
import { isConditionGroup } from '@qurvo/db';

/**
 * Extracts all cohort_id references from a V2 definition (recursive).
 */
export function extractCohortReferences(group: CohortDefinitionV2): string[] {
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
  definition: CohortDefinitionV2,
  resolveDefinition: (id: string) => Promise<CohortDefinitionV2 | null>,
): Promise<boolean> {
  const visited = new Set<string>();
  visited.add(cohortId);

  async function check(def: CohortDefinitionV2): Promise<boolean> {
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
