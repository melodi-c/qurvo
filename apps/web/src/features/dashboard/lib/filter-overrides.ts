import type { StepFilter } from '@/api/generated/Api';

export interface DashboardFilterOverrides {
  dateFrom: string | null;
  dateTo: string | null;
  propertyFilters: StepFilter[];
}

export const EMPTY_OVERRIDES: DashboardFilterOverrides = {
  dateFrom: null,
  dateTo: null,
  propertyFilters: [],
};

export function hasActiveOverrides(overrides: DashboardFilterOverrides): boolean {
  return !!(overrides.dateFrom || overrides.dateTo || overrides.propertyFilters.length > 0);
}

interface FilterableItem {
  filters?: StepFilter[];
}

function appendFilters<S extends FilterableItem>(items: S[], extra: StepFilter[]): S[] {
  return items.map((s) => ({
    ...s,
    filters: [...(s.filters ?? []), ...extra],
  }));
}

interface OverridableConfig {
  date_from?: string;
  date_to?: string;
  series?: FilterableItem[];
  steps?: FilterableItem[];
}

/**
 * Merges dashboard-level overrides into a widget config.
 * - Replaces date_from/date_to if the date override is set
 * - Appends property filters to each series/step filters array
 */
export function applyFilterOverrides<T extends OverridableConfig>(
  config: T,
  overrides: DashboardFilterOverrides,
): T {
  if (!hasActiveOverrides(overrides)) return config;

  return {
    ...config,
    ...(config.date_from !== undefined && overrides.dateFrom && { date_from: overrides.dateFrom }),
    ...(config.date_to !== undefined && overrides.dateTo && { date_to: overrides.dateTo }),
    ...(config.series && overrides.propertyFilters.length > 0 && {
      series: appendFilters(config.series, overrides.propertyFilters),
    }),
    ...(config.steps && overrides.propertyFilters.length > 0 && {
      steps: appendFilters(config.steps, overrides.propertyFilters),
    }),
  };
}
