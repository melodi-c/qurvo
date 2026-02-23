/** Frontend cohort condition types matching the backend V2 schema. */

export type CohortPropertyOperator =
  | 'eq' | 'neq' | 'contains' | 'not_contains'
  | 'is_set' | 'is_not_set'
  | 'gt' | 'lt' | 'gte' | 'lte'
  | 'regex' | 'not_regex'
  | 'in' | 'not_in'
  | 'between' | 'not_between';

export interface CohortEventFilter {
  property: string;
  operator: CohortPropertyOperator;
  value?: string;
  values?: string[];
}

export interface PropertyCondition {
  type: 'person_property';
  property: string;
  operator: CohortPropertyOperator;
  value?: string;
  values?: string[];
}

export interface EventCondition {
  type: 'event';
  event_name: string;
  count_operator: 'gte' | 'lte' | 'eq';
  count: number;
  time_window_days: number;
  event_filters?: CohortEventFilter[];
}

export interface CohortRefCondition {
  type: 'cohort';
  cohort_id: string;
  negated: boolean;
}

export interface FirstTimeEventCondition {
  type: 'first_time_event';
  event_name: string;
  time_window_days: number;
  event_filters?: CohortEventFilter[];
}

export interface NotPerformedEventCondition {
  type: 'not_performed_event';
  event_name: string;
  time_window_days: number;
  event_filters?: CohortEventFilter[];
}

export interface EventSequenceCondition {
  type: 'event_sequence';
  steps: { event_name: string; event_filters?: CohortEventFilter[] }[];
  time_window_days: number;
}

export interface NotPerformedEventSequenceCondition {
  type: 'not_performed_event_sequence';
  steps: { event_name: string; event_filters?: CohortEventFilter[] }[];
  time_window_days: number;
}

export interface PerformedRegularlyCondition {
  type: 'performed_regularly';
  event_name: string;
  period_type: 'day' | 'week' | 'month';
  total_periods: number;
  min_periods: number;
  time_window_days: number;
  event_filters?: CohortEventFilter[];
}

export interface StoppedPerformingCondition {
  type: 'stopped_performing';
  event_name: string;
  recent_window_days: number;
  historical_window_days: number;
  event_filters?: CohortEventFilter[];
}

export interface RestartedPerformingCondition {
  type: 'restarted_performing';
  event_name: string;
  recent_window_days: number;
  gap_window_days: number;
  historical_window_days: number;
  event_filters?: CohortEventFilter[];
}

export type CohortCondition =
  | PropertyCondition
  | EventCondition
  | CohortRefCondition
  | FirstTimeEventCondition
  | NotPerformedEventCondition
  | EventSequenceCondition
  | NotPerformedEventSequenceCondition
  | PerformedRegularlyCondition
  | StoppedPerformingCondition
  | RestartedPerformingCondition;

export interface CohortConditionGroup {
  type: 'AND' | 'OR';
  values: (CohortCondition | CohortConditionGroup)[];
}

/** Default empty group */
export function createEmptyGroup(type: 'AND' | 'OR' = 'AND'): CohortConditionGroup {
  return { type, values: [] };
}

/** Check if a value is a nested group */
export function isGroup(v: CohortCondition | CohortConditionGroup): v is CohortConditionGroup {
  return 'values' in v && (v.type === 'AND' || v.type === 'OR');
}

/** Condition type labels (for dropdown menu) */
export const CONDITION_TYPES = [
  'person_property',
  'event',
  'cohort',
  'first_time_event',
  'not_performed_event',
  'event_sequence',
  'not_performed_event_sequence',
  'performed_regularly',
  'stopped_performing',
  'restarted_performing',
] as const;

/** Create a default condition for a given type */
export function createDefaultCondition(type: CohortCondition['type']): CohortCondition {
  switch (type) {
    case 'person_property':
      return { type: 'person_property', property: '', operator: 'eq', value: '' };
    case 'event':
      return { type: 'event', event_name: '', count_operator: 'gte', count: 1, time_window_days: 30 };
    case 'cohort':
      return { type: 'cohort', cohort_id: '', negated: false };
    case 'first_time_event':
      return { type: 'first_time_event', event_name: '', time_window_days: 30 };
    case 'not_performed_event':
      return { type: 'not_performed_event', event_name: '', time_window_days: 30 };
    case 'event_sequence':
      return { type: 'event_sequence', steps: [{ event_name: '' }, { event_name: '' }], time_window_days: 30 };
    case 'not_performed_event_sequence':
      return { type: 'not_performed_event_sequence', steps: [{ event_name: '' }, { event_name: '' }], time_window_days: 30 };
    case 'performed_regularly':
      return { type: 'performed_regularly', event_name: '', period_type: 'week', total_periods: 4, min_periods: 3, time_window_days: 30 };
    case 'stopped_performing':
      return { type: 'stopped_performing', event_name: '', recent_window_days: 7, historical_window_days: 30 };
    case 'restarted_performing':
      return { type: 'restarted_performing', event_name: '', recent_window_days: 7, gap_window_days: 14, historical_window_days: 30 };
  }
}

/** Check if condition is valid enough for preview */
export function isConditionValid(cond: CohortCondition): boolean {
  switch (cond.type) {
    case 'person_property':
      return cond.property.trim() !== '';
    case 'event':
    case 'first_time_event':
    case 'not_performed_event':
    case 'performed_regularly':
    case 'stopped_performing':
    case 'restarted_performing':
      return cond.event_name.trim() !== '';
    case 'event_sequence':
    case 'not_performed_event_sequence':
      return cond.steps.length >= 2 && cond.steps.every((s) => s.event_name.trim() !== '');
    case 'cohort':
      return cond.cohort_id !== '';
  }
}
