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

/**
 * Merges dashboard-level date overrides into a widget config.
 * Only replaces date_from/date_to if the override is set (non-null).
 */
export function applyDateOverride<T extends { date_from: string; date_to: string }>(
  config: T,
  overrides: DashboardFilterOverrides,
): T {
  if (!overrides.dateFrom && !overrides.dateTo) return config;
  return {
    ...config,
    ...(overrides.dateFrom ? { date_from: overrides.dateFrom } : {}),
    ...(overrides.dateTo ? { date_to: overrides.dateTo } : {}),
  };
}
