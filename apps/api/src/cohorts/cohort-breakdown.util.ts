import { buildCohortMemberSubquery } from '@qurvo/cohort-query';
import type { CohortFilterInput } from '@qurvo/cohort-query';
import type { Expr } from '@qurvo/ch-query';
import { inSubquery } from '@qurvo/ch-query';
import type { CohortConditionGroup } from '@qurvo/db';
import { resolvedPerson } from '../analytics/query-helpers';

export interface CohortBreakdownEntry {
  cohort_id: string;
  name: string;
  is_static: boolean;
  materialized: boolean;
  definition: CohortConditionGroup;
  /**
   * Monotonically-increasing version token for materialized cohorts.
   * Included in the cache key so that cohort-worker recomputation automatically
   * invalidates any cached analytics result that used this cohort as a breakdown.
   * Undefined / null for inline (non-materialized, non-static) cohorts.
   */
  membership_version?: number | null;
}

/**
 * Builds the filter Expr for a single cohort breakdown entry:
 * `RESOLVED_PERSON IN (SELECT person_id FROM ... WHERE ...)`
 *
 * Returns an Expr AST node instead of a raw SQL string, eliminating the
 * string->raw() round-trip at call sites.
 *
 * Mutates queryParams with the cohort param key and any inline subquery params.
 *
 * Delegates routing (static / materialized / inline) to the unified
 * `buildCohortMemberSubquery` from @qurvo/cohort-query.
 *
 * @param dateTo - Optional datetime string (e.g. "2025-01-31 23:59:59") used as
 *   the upper bound for behavioral conditions instead of `now()`.
 * @param dateFrom - Optional datetime string used as the lower bound for the
 *   `not_performed_event` condition. When provided together with `dateTo`, the
 *   absence check is scoped to the exact `[dateFrom, dateTo]` analysis window
 *   rather than the rolling `[dateTo - N days, dateTo]` window.
 */
// eslint-disable-next-line max-params -- positional args match buildCohortSubquery signature
export function buildCohortFilterForBreakdown(
  cb: CohortBreakdownEntry,
  paramKey: string,
  subqueryOffset: number,
  queryParams: Record<string, unknown>,
  dateTo?: string,
  dateFrom?: string,
): Expr {
  const input: CohortFilterInput = {
    cohort_id: cb.cohort_id,
    definition: cb.definition,
    materialized: cb.materialized,
    is_static: cb.is_static,
    membership_version: cb.membership_version,
  };

  const node = buildCohortMemberSubquery(
    input, paramKey, 'project_id', queryParams, subqueryOffset,
    undefined, dateTo, dateFrom,
  );
  return inSubquery(resolvedPerson(), node);
}
