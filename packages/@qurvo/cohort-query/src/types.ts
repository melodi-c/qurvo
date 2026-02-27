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
  /**
   * When provided, behavioral conditions (performed_event, stopped_performing,
   * restarted_performing, not_performed_event, etc.) use this datetime as the
   * upper bound instead of `now()`.  This ensures that funnel/trend queries for
   * a fixed historical period return reproducible results regardless of the
   * current wall-clock time.
   *
   * The value is a ClickHouse-compatible datetime string such as
   * `"2025-01-31 23:59:59"` (same format as used by `toChTs()`).
   * It is stored in `queryParams` under the key `"coh_date_to"` and referenced
   * in SQL as `{coh_date_to:DateTime64(3)}`.
   */
  dateTo?: string;
}
