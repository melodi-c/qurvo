export interface BaseTargetEventConfig {
  date_from: string;
  date_to: string;
  target_event: string;
  granularity: 'day' | 'week' | 'month';
  cohort_ids?: string[];
}
