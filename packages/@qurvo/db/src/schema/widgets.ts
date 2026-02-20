import { pgTable, uuid, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
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

export interface FunnelWidgetConfig {
  type: 'funnel';
  steps: FunnelWidgetStep[];
  conversion_window_days: number;
  date_from: string;
  date_to: string;
  breakdown_property?: string;
  cohort_ids?: string[];
}

export interface TrendWidgetSeries {
  event_name: string;
  label: string;
  filters?: WidgetStepFilter[];
}

export interface TrendWidgetConfig {
  type: 'trend';
  series: TrendWidgetSeries[];
  metric: 'total_events' | 'unique_users' | 'events_per_user';
  granularity: 'hour' | 'day' | 'week' | 'month';
  chart_type: 'line' | 'bar';
  date_from: string;
  date_to: string;
  breakdown_property?: string;
  compare: boolean;
  cohort_ids?: string[];
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

export type WidgetConfig = FunnelWidgetConfig | TrendWidgetConfig | RetentionWidgetConfig;

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
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('widgets_dashboard_id_idx').on(table.dashboard_id)],
);
