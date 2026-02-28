import type { CohortConditionGroup } from '@/features/cohorts/types';

/**
 * Recursively removes `_key` fields from a cohort definition before sending to the API.
 * `_key` is a client-side stable key used for React list rendering and must never
 * be persisted in the backend's definition JSON column.
 */
export function stripClientKeys(group: CohortConditionGroup): CohortConditionGroup {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructuring to remove _key
  const { _key: _omitted, ...rest } = group as CohortConditionGroup & { _key?: string };
  return {
    ...rest,
    values: rest.values.map((v) => {
      if ('values' in v && (v.type === 'AND' || v.type === 'OR')) {
        return stripClientKeys(v);
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructuring to remove _key
      const { _key: _k, ...condition } = v as typeof v & { _key?: string };
      return condition;
    }),
  } as CohortConditionGroup;
}
