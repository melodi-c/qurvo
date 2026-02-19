export type WidgetType = 'funnel';

export type FilterOperator = 'eq' | 'neq' | 'contains' | 'not_contains' | 'is_set' | 'is_not_set';

export interface StepFilter {
  property: string;
  operator: FilterOperator;
  value: string;
}

export interface FunnelStep {
  event_name: string;
  label: string;
  filters?: StepFilter[];
}

export interface FunnelWidgetConfig {
  type: 'funnel';
  steps: FunnelStep[];
  conversion_window_days: number;
  date_from: string;
  date_to: string;
  breakdown_property?: string;
}

export type WidgetConfig = FunnelWidgetConfig;

export interface GridLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Widget {
  id: string;
  dashboard_id: string;
  type: WidgetType;
  name: string;
  config: WidgetConfig;
  layout: GridLayout;
  created_at: string;
  updated_at: string;
}

export interface Dashboard {
  id: string;
  project_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface DashboardWithWidgets extends Dashboard {
  widgets: Widget[];
}

// react-grid-layout item
export interface RglItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

// Funnel query result types (more specific than the generated client types)
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

export interface FunnelData {
  breakdown: boolean;
  breakdown_property?: string;
  steps: FunnelStepResult[] | FunnelBreakdownStepResult[];
}

export interface FunnelCacheEntry {
  data: FunnelData;
  cached_at: string;
  from_cache: boolean;
}
