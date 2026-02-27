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
  /**
   * When provided together with `dateTo`, the `not_performed_event` condition
   * checks for absence of the event in the exact `[dateFrom, dateTo]` interval
   * rather than the rolling `[dateTo - N days, dateTo]` window.
   *
   * This fixes a false-negative exclusion when a user performed the target event
   * *before* `dateFrom` (i.e., outside the analysis period) but the rolling
   * cohort window happened to reach that far back.  Semantically:
   *   - Without `dateFrom`: "user did not perform X in the last N days from dateTo"
   *   - With `dateFrom`:    "user did not perform X in [dateFrom, dateTo]"
   *
   * The second definition is correct when the condition is used as a filter in
   * a funnel/trend query — we care whether the user performed the event within
   * the *same period* we are analysing, not in some arbitrary rolling window.
   *
   * The value is a ClickHouse-compatible datetime string (same format as `dateTo`).
   * It is stored in `queryParams` under the key `"coh_date_from"` and referenced
   * in SQL as `{coh_date_from:DateTime64(3)}`.
   */
  dateFrom?: string;
}
