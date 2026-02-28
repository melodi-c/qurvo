import type { StepFilter } from '@/api/generated/Api';

export interface BaseTargetEventConfig {
  date_from: string;
  date_to: string;
  target_event: string;
  granularity: 'day' | 'week' | 'month';
  filters?: StepFilter[];
  cohort_ids?: string[];
}
