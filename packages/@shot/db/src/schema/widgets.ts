import { pgTable, uuid, varchar, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { dashboards } from './dashboards';

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
}

export type WidgetConfig = FunnelWidgetConfig | TrendWidgetConfig;

export const widgets = pgTable(
  'widgets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dashboard_id: uuid('dashboard_id')
      .notNull()
      .references(() => dashboards.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 50 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    config: jsonb('config').notNull().$type<WidgetConfig>(),
    layout: jsonb('layout').notNull().$type<WidgetLayout>(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('widgets_dashboard_id_idx').on(table.dashboard_id)],
);
