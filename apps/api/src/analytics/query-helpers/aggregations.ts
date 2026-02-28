import type { Expr } from '@qurvo/ch-query';
import { avg, count, func, max, min, raw, sum, uniqExact } from '@qurvo/ch-query';
import { resolvedPerson } from './resolved-person';
import { resolveNumericPropertyExpr } from './filters';

export type TrendMetric =
  | 'total_events'
  | 'unique_users'
  | 'events_per_user'
  | 'property_sum'
  | 'property_avg'
  | 'property_min'
  | 'property_max';

/**
 * Returns the standard pair of metric columns used across analytics queries:
 *   count() AS raw_value
 *   uniqExact(RESOLVED_PERSON) AS uniq_value
 */
export function baseMetricColumns(): Expr[] {
  return [
    count().as('raw_value'),
    uniqExact(resolvedPerson()).as('uniq_value'),
  ];
}

/**
 * Aggregation column for a given trend metric.
 *
 * - total_events: count()
 * - unique_users: uniqExact(RESOLVED_PERSON)
 * - events_per_user: count() / uniqExact(RESOLVED_PERSON)
 * - property_sum: sum(toFloat64OrZero(JSONExtractRaw(properties, key)))
 * - property_avg: avg(toFloat64OrZero(JSONExtractRaw(properties, key)))
 * - property_min: min(toFloat64OrZero(JSONExtractRaw(properties, key)))
 * - property_max: max(toFloat64OrZero(JSONExtractRaw(properties, key)))
 */
export function aggColumn(metric: TrendMetric, metricProperty?: string): Expr {
  switch (metric) {
    case 'total_events':
      return count();
    case 'unique_users':
      return uniqExact(resolvedPerson());
    case 'events_per_user':
      return raw(`count() / uniqExact(${resolvedPersonSQL()})`);
    case 'property_sum': {
      if (!metricProperty) throw new Error('property_sum requires metricProperty');
      return sum(resolveNumericPropertyExpr(metricProperty));
    }
    case 'property_avg': {
      if (!metricProperty) throw new Error('property_avg requires metricProperty');
      return avg(resolveNumericPropertyExpr(metricProperty));
    }
    case 'property_min': {
      if (!metricProperty) throw new Error('property_min requires metricProperty');
      return min(resolveNumericPropertyExpr(metricProperty));
    }
    case 'property_max': {
      if (!metricProperty) throw new Error('property_max requires metricProperty');
      return max(resolveNumericPropertyExpr(metricProperty));
    }
    default: {
      const _exhaustive: never = metric;
      throw new Error(`Unhandled metric: ${_exhaustive}`);
    }
  }
}

/**
 * toFloat64OrZero wrapper for a numeric property.
 */
export function numericProperty(prop: string): Expr {
  return resolveNumericPropertyExpr(prop);
}

function resolvedPersonSQL(): string {
  return `coalesce(dictGetOrNull('person_overrides_dict', 'person_id', (project_id, distinct_id)), person_id)`;
}
