import type { CohortConditionGroup } from '@qurvo/db';
import { extractCohortReferences } from './validation';

export interface CohortForSort {
  id: string;
  definition: CohortConditionGroup;
}

export interface ToposortResult {
  sorted: CohortForSort[];
  cyclic: string[];
}

/**
 * Topologically sorts cohorts so dependencies are computed first (Kahn's algorithm).
 * References to cohort IDs not in the input set are ignored (already fresh).
 */
export function topologicalSortCohorts(cohorts: CohortForSort[]): ToposortResult {
  if (cohorts.length === 0) return { sorted: [], cyclic: [] };

  const idSet = new Set(cohorts.map((c) => c.id));
  const cohortMap = new Map(cohorts.map((c) => [c.id, c]));

  // Build adjacency: edge from dependency → dependent
  // inDegree counts how many in-set dependencies each cohort has
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>(); // depId → [cohorts that depend on it]

  for (const c of cohorts) {
    inDegree.set(c.id, 0);
    dependents.set(c.id, []);
  }

  for (const c of cohorts) {
    const refs = extractCohortReferences(c.definition);
    for (const refId of refs) {
      if (!idSet.has(refId)) continue; // dependency not in stale set — skip
      inDegree.set(c.id, (inDegree.get(c.id) ?? 0) + 1);
      dependents.get(refId)!.push(c.id);
    }
  }

  // Kahn's algorithm
  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const sorted: CohortForSort[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    sorted.push(cohortMap.get(id)!);

    for (const depId of dependents.get(id) ?? []) {
      const newDeg = (inDegree.get(depId) ?? 1) - 1;
      inDegree.set(depId, newDeg);
      if (newDeg === 0) queue.push(depId);
    }
  }

  // Any remaining nodes are part of cycles
  const cyclic: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree > 0) cyclic.push(id);
  }

  return { sorted, cyclic };
}
