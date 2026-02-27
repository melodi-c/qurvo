/**
 * Minimal stub of @qurvo/cohort-query for unit tests that import
 * clickhouse-helpers.ts.  Only the symbols re-exported from that module are
 * needed; the actual runtime values are never called by the functions under
 * test.
 */
export const buildCohortFilterClause = (): string => '';

export type CohortFilterInput = Record<string, unknown>;

export const RESOLVED_PERSON = 'person_id';

export const validateDefinitionComplexity = (): void => {};
export const detectCircularDependency = async (): Promise<boolean> => false;
