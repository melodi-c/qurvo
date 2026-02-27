import { describe, it, expect } from 'vitest';
import { computeAggregateSteps, computeStepResults, computePropertyBreakdownResults } from '../../analytics/funnel/funnel-results';
import type { FunnelBreakdownStepResult } from '../../analytics/funnel/funnel.types';

const steps = [
  { event_name: 'page_view', label: 'Page View' },
  { event_name: 'signup', label: 'Sign Up' },
  { event_name: 'purchase', label: 'Purchase' },
];

describe('computeAggregateSteps', () => {
  it('last step drop_off is 0 (same semantics as computeStepResults)', () => {
    // Both computeStepResults and computeAggregateSteps: last step drop_off = 0, drop_off_rate = 0
    // Semantics: the last step has no "next step" to drop off to, so nobody is counted as dropped.
    const rows = [
      { step_num: '1', entered: '100', next_step: '40', avg_time_seconds: '5' },
      { step_num: '2', entered: '40', next_step: '15', avg_time_seconds: '3' },
      { step_num: '3', entered: '15', next_step: '0', avg_time_seconds: null },
    ];
    const stepResults = computeStepResults(rows, steps, 3);

    // Build breakdown input that sums to the same totals
    const breakdownSteps: FunnelBreakdownStepResult[] = [
      { step: 1, label: 'Page View', event_name: 'page_view', count: 60, conversion_rate: 100, drop_off: 20, drop_off_rate: 33.3, avg_time_to_convert_seconds: null, breakdown_value: 'A' },
      { step: 2, label: 'Sign Up', event_name: 'signup', count: 25, conversion_rate: 50, drop_off: 10, drop_off_rate: 40, avg_time_to_convert_seconds: null, breakdown_value: 'A' },
      { step: 3, label: 'Purchase', event_name: 'purchase', count: 10, conversion_rate: 20, drop_off: 0, drop_off_rate: 0, avg_time_to_convert_seconds: null, breakdown_value: 'A' },
      { step: 1, label: 'Page View', event_name: 'page_view', count: 40, conversion_rate: 100, drop_off: 20, drop_off_rate: 50, avg_time_to_convert_seconds: null, breakdown_value: 'B' },
      { step: 2, label: 'Sign Up', event_name: 'signup', count: 15, conversion_rate: 50, drop_off: 10, drop_off_rate: 66.7, avg_time_to_convert_seconds: null, breakdown_value: 'B' },
      { step: 3, label: 'Purchase', event_name: 'purchase', count: 5, conversion_rate: 10, drop_off: 0, drop_off_rate: 0, avg_time_to_convert_seconds: null, breakdown_value: 'B' },
    ];
    const agg = computeAggregateSteps(breakdownSteps, steps);

    // Aggregate step 3 total = 10 + 5 = 15, matching stepResults
    expect(agg[2].count).toBe(15);
    // Last step: drop_off must be 0 (no next step to drop off to)
    expect(agg[2].drop_off).toBe(0);
    expect(agg[2].drop_off_rate).toBe(0);
    // This matches computeStepResults semantics exactly
    expect(agg[2].drop_off).toBe(stepResults[2].drop_off);
    expect(agg[2].drop_off_rate).toBe(stepResults[2].drop_off_rate);
  });

  it('last step drop_off_rate is 0 when count is 0 (no division by zero)', () => {
    const breakdownSteps: FunnelBreakdownStepResult[] = [
      { step: 1, label: 'Page View', event_name: 'page_view', count: 10, conversion_rate: 100, drop_off: 10, drop_off_rate: 100, avg_time_to_convert_seconds: null, breakdown_value: 'A' },
      { step: 2, label: 'Sign Up', event_name: 'signup', count: 0, conversion_rate: 0, drop_off: 0, drop_off_rate: 0, avg_time_to_convert_seconds: null, breakdown_value: 'A' },
    ];
    const agg = computeAggregateSteps(breakdownSteps, steps.slice(0, 2));
    expect(agg[1].count).toBe(0);
    expect(agg[1].drop_off).toBe(0);
    expect(agg[1].drop_off_rate).toBe(0);
  });

  it('assigns correct labels when all steps are present', () => {
    const breakdownSteps: FunnelBreakdownStepResult[] = [
      { step: 1, label: 'Page View', event_name: 'page_view', count: 10, conversion_rate: 100, drop_off: 5, drop_off_rate: 50, avg_time_to_convert_seconds: null, breakdown_value: 'Chrome' },
      { step: 2, label: 'Sign Up', event_name: 'signup', count: 5, conversion_rate: 50, drop_off: 5, drop_off_rate: 100, avg_time_to_convert_seconds: null, breakdown_value: 'Chrome' },
      { step: 3, label: 'Purchase', event_name: 'purchase', count: 0, conversion_rate: 0, drop_off: 0, drop_off_rate: 0, avg_time_to_convert_seconds: null, breakdown_value: 'Chrome' },
      { step: 1, label: 'Page View', event_name: 'page_view', count: 3, conversion_rate: 100, drop_off: 3, drop_off_rate: 100, avg_time_to_convert_seconds: null, breakdown_value: 'Firefox' },
      { step: 2, label: 'Sign Up', event_name: 'signup', count: 0, conversion_rate: 0, drop_off: 0, drop_off_rate: 0, avg_time_to_convert_seconds: null, breakdown_value: 'Firefox' },
      { step: 3, label: 'Purchase', event_name: 'purchase', count: 0, conversion_rate: 0, drop_off: 0, drop_off_rate: 0, avg_time_to_convert_seconds: null, breakdown_value: 'Firefox' },
    ];

    const agg = computeAggregateSteps(breakdownSteps, steps);

    expect(agg).toHaveLength(3);
    expect(agg[0]).toMatchObject({ step: 1, label: 'Page View', event_name: 'page_view', count: 13 });
    expect(agg[1]).toMatchObject({ step: 2, label: 'Sign Up', event_name: 'signup', count: 5 });
    expect(agg[2]).toMatchObject({ step: 3, label: 'Purchase', event_name: 'purchase', count: 0 });
  });

  it('assigns correct labels when intermediate step 2 is missing from stepTotals', () => {
    // Simulate breakdown rows where step 2 is entirely absent (e.g., no ClickHouse row emitted
    // for step 2 of any breakdown value). stepNums = [1, 3]; idx=0 maps to sn=1, idx=1 maps to sn=3.
    // Before the fix: steps[idx=1] = steps[1] = "Sign Up" was wrongly assigned to step 3.
    // After the fix: steps[sn-1] = steps[2] = "Purchase" is correctly assigned to step 3.
    const breakdownSteps: FunnelBreakdownStepResult[] = [
      { step: 1, label: 'Page View', event_name: 'page_view', count: 5, conversion_rate: 100, drop_off: 5, drop_off_rate: 100, avg_time_to_convert_seconds: null, breakdown_value: 'Chrome' },
      // step 2 is intentionally absent for all breakdown values
      { step: 3, label: 'Purchase', event_name: 'purchase', count: 0, conversion_rate: 0, drop_off: 0, drop_off_rate: 0, avg_time_to_convert_seconds: null, breakdown_value: 'Chrome' },
    ];

    const agg = computeAggregateSteps(breakdownSteps, steps);

    expect(agg).toHaveLength(2);
    // Step 1 must have label "Page View"
    expect(agg[0]).toMatchObject({ step: 1, label: 'Page View', event_name: 'page_view' });
    // Step 3 must have label "Purchase", NOT "Sign Up" (which the old idx-based lookup would return)
    expect(agg[1]).toMatchObject({ step: 3, label: 'Purchase', event_name: 'purchase' });
  });

  it('assigns correct labels when step 1 is missing from stepTotals', () => {
    // stepNums = [2, 3]; idx=0 → sn=2, idx=1 → sn=3.
    // Before the fix: steps[0] = "Page View" for step 2, steps[1] = "Sign Up" for step 3.
    // After the fix: steps[1] = "Sign Up" for step 2, steps[2] = "Purchase" for step 3.
    const breakdownSteps: FunnelBreakdownStepResult[] = [
      { step: 2, label: 'Sign Up', event_name: 'signup', count: 4, conversion_rate: 100, drop_off: 4, drop_off_rate: 100, avg_time_to_convert_seconds: null, breakdown_value: 'Chrome' },
      { step: 3, label: 'Purchase', event_name: 'purchase', count: 0, conversion_rate: 0, drop_off: 0, drop_off_rate: 0, avg_time_to_convert_seconds: null, breakdown_value: 'Chrome' },
    ];

    const agg = computeAggregateSteps(breakdownSteps, steps);

    expect(agg).toHaveLength(2);
    expect(agg[0]).toMatchObject({ step: 2, label: 'Sign Up', event_name: 'signup' });
    expect(agg[1]).toMatchObject({ step: 3, label: 'Purchase', event_name: 'purchase' });
  });
});

describe('computePropertyBreakdownResults — breakdown_value empty string vs null', () => {
  it('empty string breakdown_value maps to (none) — not a separate group', () => {
    // Users with properties.plan = '' should map to '(none)', same as null/missing property.
    // The key requirement from the issue: '' must NOT produce a separate '' group.
    const rows = [
      { step_num: '1', entered: '5', next_step: '3', avg_time_seconds: null, breakdown_value: '' },
      { step_num: '2', entered: '3', next_step: '0', avg_time_seconds: null, breakdown_value: '' },
    ];

    const result = computePropertyBreakdownResults(rows, steps, 2);

    // No group with breakdown_value === '' should exist
    const emptyStringGroup = result.filter((r) => r.breakdown_value === '');
    expect(emptyStringGroup).toHaveLength(0);

    // Instead, rows collapsed to '(none)'
    const noneGroup = result.filter((r) => r.breakdown_value === '(none)');
    expect(noneGroup.find((r) => r.step === 1)?.count).toBe(5);
    expect(noneGroup.find((r) => r.step === 2)?.count).toBe(3);
  });

  it('null breakdown_value maps to (none)', () => {
    const rows = [
      { step_num: '1', entered: '7', next_step: '2', avg_time_seconds: null, breakdown_value: null as unknown as string },
      { step_num: '2', entered: '2', next_step: '0', avg_time_seconds: null, breakdown_value: null as unknown as string },
    ];

    const result = computePropertyBreakdownResults(rows, steps, 2);

    const noneGroup = result.filter((r) => r.breakdown_value === '(none)');
    expect(noneGroup.find((r) => r.step === 1)?.count).toBe(7);
    expect(noneGroup.find((r) => r.step === 2)?.count).toBe(2);
  });

  it('non-empty breakdown_value is preserved as-is and separate from (none)', () => {
    const rows = [
      { step_num: '1', entered: '10', next_step: '4', avg_time_seconds: null, breakdown_value: 'premium' },
      { step_num: '2', entered: '4', next_step: '0', avg_time_seconds: null, breakdown_value: 'premium' },
      { step_num: '1', entered: '3', next_step: '1', avg_time_seconds: null, breakdown_value: null as unknown as string },
      { step_num: '2', entered: '1', next_step: '0', avg_time_seconds: null, breakdown_value: null as unknown as string },
    ];

    const result = computePropertyBreakdownResults(rows, steps, 2);

    const premiumGroup = result.filter((r) => r.breakdown_value === 'premium');
    const noneGroup = result.filter((r) => r.breakdown_value === '(none)');

    expect(premiumGroup.find((r) => r.step === 1)?.count).toBe(10);
    expect(premiumGroup.find((r) => r.step === 2)?.count).toBe(4);
    expect(noneGroup.find((r) => r.step === 1)?.count).toBe(3);
    expect(noneGroup.find((r) => r.step === 2)?.count).toBe(1);
    // No mixing between premium and (none)
    expect(result.every((r) => r.breakdown_value === 'premium' || r.breakdown_value === '(none)')).toBe(true);
  });

  it('undefined breakdown_value maps to (none)', () => {
    const rows = [
      { step_num: '1', entered: '6', next_step: '2', avg_time_seconds: null, breakdown_value: undefined as unknown as string },
      { step_num: '2', entered: '2', next_step: '0', avg_time_seconds: null, breakdown_value: undefined as unknown as string },
    ];

    const result = computePropertyBreakdownResults(rows, steps, 2);
    const noneGroup = result.filter((r) => r.breakdown_value === '(none)');
    expect(noneGroup).toHaveLength(2); // step 1 and step 2
    expect(noneGroup.find((r) => r.step === 1)?.count).toBe(6);
    expect(noneGroup.find((r) => r.step === 2)?.count).toBe(2);
  });
});
