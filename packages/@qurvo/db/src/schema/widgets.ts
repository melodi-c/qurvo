import { pgTable, uuid, timestamp, jsonb, index, text } from 'drizzle-orm/pg-core';
import { dashboards } from './dashboards';
import { insights } from './insights';

export interface WidgetLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

type FilterOperator = 'eq' | 'neq' | 'contains' | 'not_contains' | 'is_set' | 'is_not_set';

export interface WidgetStepFilter {
  property: string;
  operator: FilterOperator;
  value?: string;
}

export interface FunnelWidgetStep {
  event_name: string;
  label: string;
  filters?: WidgetStepFilter[];
}

export type FunnelOrderType = 'ordered' | 'strict' | 'unordered';
export type FunnelVizType = 'steps' | 'time_to_convert';
export type ConversionWindowUnit = 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month';
export type ConversionRateDisplay = 'total' | 'relative';

export interface FunnelExclusionConfig {
  event_name: string;
  funnel_from_step: number;
  funnel_to_step: number;
}

export interface FunnelWidgetConfig {
  type: 'funnel';
  steps: FunnelWidgetStep[];
  conversion_window_days: number;
  conversion_window_value?: number;
  conversion_window_unit?: ConversionWindowUnit;
  date_from: string;
  date_to: string;
  breakdown_property?: string;
  breakdown_type?: 'property' | 'cohort';
  breakdown_cohort_ids?: string[];
  cohort_ids?: string[];
  funnel_order_type?: FunnelOrderType;
  funnel_viz_type?: FunnelVizType;
  conversion_rate_display?: ConversionRateDisplay;
  exclusions?: FunnelExclusionConfig[];
  time_to_convert_from_step?: number;
  time_to_convert_to_step?: number;
}

export interface TrendWidgetSeries {
  event_name: string;
  label: string;
  filters?: WidgetStepFilter[];
}

export interface TrendFormula {
  id: string;
  label: string;
  expression: string;
}

export interface TrendWidgetConfig {
  type: 'trend';
  series: TrendWidgetSeries[];
  metric: 'total_events' | 'unique_users' | 'events_per_user'
    | 'property_sum' | 'property_avg' | 'property_min' | 'property_max';
  metric_property?: string;
  granularity: 'hour' | 'day' | 'week' | 'month';
  chart_type: 'line' | 'bar';
  date_from: string;
  date_to: string;
  breakdown_property?: string;
  breakdown_type?: 'property' | 'cohort';
  breakdown_cohort_ids?: string[];
  compare: boolean;
  cohort_ids?: string[];
  formulas?: TrendFormula[];
}

export interface RetentionWidgetConfig {
  type: 'retention';
  target_event: string;
  retention_type: 'first_time' | 'recurring';
  granularity: 'day' | 'week' | 'month';
  periods: number;
  date_from: string;
  date_to: string;
  cohort_ids?: string[];
}

export interface LifecycleWidgetConfig {
  type: 'lifecycle';
  target_event: string;
  granularity: 'day' | 'week' | 'month';
  date_from: string;
  date_to: string;
  cohort_ids?: string[];
}

export interface StickinessWidgetConfig {
  type: 'stickiness';
  target_event: string;
  granularity: 'day' | 'week' | 'month';
  date_from: string;
  date_to: string;
  cohort_ids?: string[];
}

export interface PathCleaningRule {
  regex: string;
  alias: string;
}

export interface WildcardGroup {
  pattern: string;
  alias: string;
}

export interface PathsWidgetConfig {
  type: 'paths';
  date_from: string;
  date_to: string;
  step_limit: number;
  start_event?: string;
  end_event?: string;
  exclusions?: string[];
  min_persons?: number;
  path_cleaning_rules?: PathCleaningRule[];
  wildcard_groups?: WildcardGroup[];
  cohort_ids?: string[];
}

export type WidgetConfig = FunnelWidgetConfig | TrendWidgetConfig | RetentionWidgetConfig | LifecycleWidgetConfig | StickinessWidgetConfig | PathsWidgetConfig;

export const widgets = pgTable(
  'widgets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dashboard_id: uuid('dashboard_id')
      .notNull()
      .references(() => dashboards.id, { onDelete: 'cascade' }),
    insight_id: uuid('insight_id')
      .references(() => insights.id, { onDelete: 'set null' }),
    layout: jsonb('layout').notNull().$type<WidgetLayout>(),
    content: text('content'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('widgets_dashboard_id_idx').on(table.dashboard_id)],
);
