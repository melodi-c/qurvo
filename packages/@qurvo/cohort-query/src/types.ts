import type { CohortDefinition, CohortDefinitionV2 } from '@qurvo/db';

export interface CohortFilterInput {
  cohort_id: string;
  definition: CohortDefinition | CohortDefinitionV2;
  materialized: boolean;
  is_static: boolean;
}

export interface BuildContext {
  projectIdParam: string;
  queryParams: Record<string, unknown>;
  /** Counter for unique parameter names, mutated during building */
  counter: { value: number };
}
