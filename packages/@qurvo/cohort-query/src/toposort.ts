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
/**
 * Groups already-sorted cohorts into dependency levels.
 * Level 0 = no in-set dependencies; level N = depends on at least one node at level N-1.
 */
export function groupCohortsByLevel(sorted: CohortForSort[]): CohortForSort[][] {
  if (sorted.length === 0) return [];

  const idSet = new Set(sorted.map((c) => c.id));
  const depth = new Map<string, number>();

  for (const c of sorted) {
    const refs = extractCohortReferences(c.definition).filter((id) => idSet.has(id));
    const maxRefDepth = refs.length > 0
      ? Math.max(...refs.map((id) => depth.get(id) ?? 0))
      : -1;
    depth.set(c.id, maxRefDepth + 1);
  }

  const maxLevel = Math.max(...sorted.map((c) => depth.get(c.id)!));
  const levels: CohortForSort[][] = Array.from({ length: maxLevel + 1 }, () => []);
  for (const c of sorted) {
    levels[depth.get(c.id)!].push(c);
  }
  return levels;
}

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
