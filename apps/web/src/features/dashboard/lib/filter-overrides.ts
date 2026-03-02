export interface DashboardFilterOverrides {
  dateFrom: string | null;
  dateTo: string | null;
}

export const EMPTY_OVERRIDES: DashboardFilterOverrides = {
  dateFrom: null,
  dateTo: null,
};

export function hasActiveOverrides(overrides: DashboardFilterOverrides): boolean {
  return !!(overrides.dateFrom || overrides.dateTo);
}

interface OverridableConfig {
  date_from?: string;
  date_to?: string;
}

/**
 * Merges dashboard-level date overrides into a widget config.
 * Replaces date_from/date_to if the date override is set.
 */
export function applyFilterOverrides<T extends OverridableConfig>(
  config: T,
  overrides: DashboardFilterOverrides,
): T {
  if (!hasActiveOverrides(overrides)) {return config;}

  return {
    ...config,
    ...(config.date_from !== undefined && overrides.dateFrom && { date_from: overrides.dateFrom }),
    ...(config.date_to !== undefined && overrides.dateTo && { date_to: overrides.dateTo }),
  };
}
