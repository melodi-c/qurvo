import type { CohortConditionGroup } from '@qurvo/db';
import type { CohortFilterInput } from '../cohorts/cohorts.query';
import type { PropertyFilter } from '../utils/property-filter';

// ── Step / Exclusion types ───────────────────────────────────────────────────

export type StepFilter = PropertyFilter;
export type FunnelOrderType = 'ordered' | 'strict' | 'unordered';

export interface FunnelStep {
  event_name: string;
  event_names?: string[];
  label: string;
  filters?: StepFilter[];
}

export interface FunnelExclusion {
  event_name: string;
  funnel_from_step: number;
  funnel_to_step: number;
}

// ── Result types ─────────────────────────────────────────────────────────────

export interface FunnelStepResult {
  step: number;
  label: string;
  event_name: string;
  count: number;
  conversion_rate: number;
  drop_off: number;
  drop_off_rate: number;
  avg_time_to_convert_seconds: number | null;
}

export interface FunnelBreakdownStepResult extends FunnelStepResult {
  breakdown_value: string;
}

export type FunnelQueryResult =
  | { breakdown: false; steps: FunnelStepResult[]; sampling_factor?: number }
  | { breakdown: true; breakdown_property: string; steps: FunnelBreakdownStepResult[]; aggregate_steps: FunnelStepResult[]; sampling_factor?: number };

// ── Query param types ────────────────────────────────────────────────────────

export interface FunnelQueryParams {
  project_id: string;
  steps: FunnelStep[];
  conversion_window_days: number;
  conversion_window_value?: number;
  conversion_window_unit?: string;
  date_from: string;
  date_to: string;
  breakdown_property?: string;
  breakdown_cohort_ids?: { cohort_id: string; name: string; is_static: boolean; materialized: boolean; definition: CohortConditionGroup }[];
  cohort_filters?: CohortFilterInput[];
  funnel_order_type?: FunnelOrderType;
  exclusions?: FunnelExclusion[];
  sampling_factor?: number;
}

// ── Time to Convert types ────────────────────────────────────────────────────

export interface TimeToConvertBin {
  from_seconds: number;
  to_seconds: number;
  count: number;
}

export interface TimeToConvertResult {
  from_step: number;
  to_step: number;
  average_seconds: number | null;
  median_seconds: number | null;
  sample_size: number;
  bins: TimeToConvertBin[];
}

export interface TimeToConvertParams {
  project_id: string;
  steps: FunnelStep[];
  conversion_window_days: number;
  conversion_window_value?: number;
  conversion_window_unit?: string;
  date_from: string;
  date_to: string;
  from_step: number;
  to_step: number;
  cohort_filters?: CohortFilterInput[];
  sampling_factor?: number;
}
