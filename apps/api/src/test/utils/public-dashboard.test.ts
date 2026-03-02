import { describe, it, expect } from 'vitest';
import { applyDashboardDateOverrides } from '../../api/controllers/public.controller';

describe('applyDashboardDateOverrides', () => {
  const baseConfig: Record<string, unknown> = {
    type: 'trend',
    series: [{ event_name: '$pageview', label: 'PV' }],
    granularity: 'day',
    chart_type: 'line',
    date_from: '2025-01-01',
    date_to: '2025-01-31',
    compare: false,
  };

  it('returns config unchanged when both overrides are null', () => {
    const result = applyDashboardDateOverrides(baseConfig, null, null);
    expect(result).toBe(baseConfig);
  });

  it('overrides date_from when dashboard has date_from', () => {
    const result = applyDashboardDateOverrides(baseConfig, '-30d', null);
    expect(result.date_from).toBe('-30d');
    expect(result.date_to).toBe('2025-01-31');
  });

  it('overrides date_to when dashboard has date_to', () => {
    const result = applyDashboardDateOverrides(baseConfig, null, 'today');
    expect(result.date_from).toBe('2025-01-01');
    expect(result.date_to).toBe('today');
  });

  it('overrides both dates when dashboard has both', () => {
    const result = applyDashboardDateOverrides(baseConfig, '-7d', 'today');
    expect(result.date_from).toBe('-7d');
    expect(result.date_to).toBe('today');
  });

  it('does not add date_from if config does not have date_from', () => {
    const configWithoutDates: Record<string, unknown> = {
      type: 'trend',
      series: [],
    };
    const result = applyDashboardDateOverrides(configWithoutDates, '-30d', 'today');
    expect(result.date_from).toBeUndefined();
    expect(result.date_to).toBeUndefined();
  });

  it('preserves other config fields', () => {
    const result = applyDashboardDateOverrides(baseConfig, '-7d', 'today');
    expect(result.type).toBe('trend');
    expect(result.series).toEqual([{ event_name: '$pageview', label: 'PV' }]);
    expect(result.granularity).toBe('day');
    expect(result.chart_type).toBe('line');
    expect(result.compare).toBe(false);
  });
});
