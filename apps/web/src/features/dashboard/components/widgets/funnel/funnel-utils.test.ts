import { describe, it, expect } from 'vitest';
import { getFunnelMetrics } from './funnel-utils';
import type { FunnelResult, FunnelStepResult } from '@/api/generated/Api';

function makeStep(count: number, step = 1): FunnelStepResult {
  return {
    step,
    label: `Step ${step}`,
    event_name: `event_${step}`,
    count,
    conversion_rate: null as unknown as number,
    drop_off: 0,
    drop_off_rate: 0,
    avg_time_to_convert_seconds: null,
  };
}

describe('getFunnelMetrics', () => {
  it('returns nulls when data is undefined', () => {
    const result = getFunnelMetrics(undefined);
    expect(result.overallConversion).toBeNull();
    expect(result.totalEntered).toBeNull();
    expect(result.totalConverted).toBeNull();
  });

  it('computes overallConversion from first and last step count', () => {
    const data: FunnelResult = {
      breakdown: false,
      steps: [makeStep(1000, 1), makeStep(600, 2), makeStep(300, 3)],
    };
    const result = getFunnelMetrics(data);
    // 300 / 1000 * 100 = 30.0
    expect(result.overallConversion).toBe(30);
    expect(result.totalEntered).toBe(1000);
    expect(result.totalConverted).toBe(300);
  });

  it('rounds to 1 decimal place', () => {
    const data: FunnelResult = {
      breakdown: false,
      steps: [makeStep(3, 1), makeStep(1, 2)],
    };
    const result = getFunnelMetrics(data);
    // 1 / 3 * 100 = 33.3333... → rounded to 33.3
    expect(result.overallConversion).toBe(33.3);
  });

  it('returns null for overallConversion when first step count is 0', () => {
    const data: FunnelResult = {
      breakdown: false,
      steps: [makeStep(0, 1), makeStep(0, 2)],
    };
    const result = getFunnelMetrics(data);
    expect(result.overallConversion).toBeNull();
    expect(result.totalEntered).toBe(0);
    expect(result.totalConverted).toBe(0);
  });

  it('uses aggregate_steps when present (breakdown mode)', () => {
    const data: FunnelResult = {
      breakdown: true,
      steps: [makeStep(500, 1), makeStep(250, 2)],
      aggregate_steps: [makeStep(1000, 1), makeStep(800, 2)],
    };
    const result = getFunnelMetrics(data);
    // aggregate_steps takes precedence: 800 / 1000 * 100 = 80.0
    expect(result.overallConversion).toBe(80);
    expect(result.totalEntered).toBe(1000);
    expect(result.totalConverted).toBe(800);
  });

  it('handles single-step funnel (overallConversion = 100)', () => {
    const data: FunnelResult = {
      breakdown: false,
      steps: [makeStep(500, 1)],
    };
    const result = getFunnelMetrics(data);
    // first === last → 500 / 500 * 100 = 100
    expect(result.overallConversion).toBe(100);
    expect(result.totalEntered).toBe(500);
    expect(result.totalConverted).toBe(500);
  });

  it('returns nulls when steps array is empty', () => {
    const data: FunnelResult = {
      breakdown: false,
      steps: [],
    };
    const result = getFunnelMetrics(data);
    expect(result.overallConversion).toBeNull();
    expect(result.totalEntered).toBeNull();
    expect(result.totalConverted).toBeNull();
  });
});
