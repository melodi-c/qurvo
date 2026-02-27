import { isGroup, type CohortCondition, type CohortConditionGroup } from '@/features/cohorts/types';

export function conditionsSummary(definition: unknown, noConditionsLabel: string): string {
  try {
    const root = definition as CohortConditionGroup;
    if (!root || !root.values) return noConditionsLabel;
    return groupSummary(root) || noConditionsLabel;
  } catch {
    return noConditionsLabel;
  }
}

export function groupSummary(group: CohortConditionGroup): string {
  const parts = group.values.map((v) => {
    if (isGroup(v)) return `(${groupSummary(v)})`;
    return condSummary(v as CohortCondition);
  });
  const joiner = group.type === 'AND' ? ' AND ' : ' OR ';
  return parts.filter(Boolean).join(joiner);
}

export function condSummary(c: CohortCondition): string {
  switch (c.type) {
    case 'person_property':
      return `${c.property} ${c.operator} ${c.value ?? ''}`.trim();
    case 'event': {
      const agg = c.aggregation_type && c.aggregation_type !== 'count'
        ? `${c.aggregation_type}(${c.aggregation_property ?? '?'})`
        : c.event_name;
      return `${agg} ${c.count_operator} ${c.count}${c.aggregation_type && c.aggregation_type !== 'count' ? '' : 'x'} / ${c.time_window_days}d`;
    }
    case 'cohort':
      return `${c.negated ? 'NOT ' : ''}cohort:${c.cohort_id.slice(0, 8)}`;
    case 'first_time_event':
      return `first(${c.event_name}) / ${c.time_window_days}d`;
    case 'not_performed_event':
      return `!${c.event_name} / ${c.time_window_days}d`;
    case 'event_sequence':
      return `seq(${c.steps.map((s) => s.event_name).join(' > ')})`;
    case 'not_performed_event_sequence':
      return `!seq(${c.steps.map((s) => s.event_name).join(' > ')})`;
    case 'performed_regularly':
      return `reg(${c.event_name}) ${c.min_periods}/${c.total_periods}`;
    case 'stopped_performing':
      return `stopped(${c.event_name})`;
    case 'restarted_performing':
      return `restarted(${c.event_name})`;
  }
}
