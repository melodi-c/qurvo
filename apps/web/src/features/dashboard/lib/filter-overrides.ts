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

/**
 * Merges dashboard-level overrides into a widget config.
 * - Replaces date_from/date_to if the date override is set
 * - Appends property filters to each series/step filters array
 */
export function applyFilterOverrides<T extends Record<string, any>>(
  config: T,
  overrides: DashboardFilterOverrides,
): T {
  if (!hasActiveOverrides(overrides)) return config;

  let result = { ...config };

  // Apply date overrides
  if ('date_from' in result && 'date_to' in result) {
    if (overrides.dateFrom) result = { ...result, date_from: overrides.dateFrom };
    if (overrides.dateTo) result = { ...result, date_to: overrides.dateTo };
  }

  // Apply property filters to trend series
  if (overrides.propertyFilters.length > 0 && Array.isArray(result.series)) {
    result = {
      ...result,
      series: result.series.map((s: any) => ({
        ...s,
        filters: [...(s.filters ?? []), ...overrides.propertyFilters],
      })),
    };
  }

  // Apply property filters to funnel steps
  if (overrides.propertyFilters.length > 0 && Array.isArray(result.steps)) {
    result = {
      ...result,
      steps: result.steps.map((s: any) => ({
        ...s,
        filters: [...(s.filters ?? []), ...overrides.propertyFilters],
      })),
    };
  }

  return result;
}
