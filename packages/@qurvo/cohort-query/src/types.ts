import type { CohortConditionGroup } from '@qurvo/db';

export interface CohortFilterInput {
  cohort_id: string;
  definition: CohortConditionGroup;
  materialized: boolean;
  is_static: boolean;
}

export interface BuildContext {
  projectIdParam: string;
  queryParams: Record<string, unknown>;
  /** Counter for unique parameter names, mutated during building */
  counter: { value: number };
}
