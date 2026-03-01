import type { FunnelStepResult } from '@/api/generated/Api';

// Helper

/**
 * Build a FunnelStepResult with derived conversion/drop-off metrics.
 *
 * @param step        1-based step index.
 * @param label       Human-readable step name.
 * @param eventName   SDK event name for this step.
 * @param count       Number of users who reached this step.
 * @param totalCount  Users who entered the funnel (step 1 count).
 * @param prevCount   Users who completed the previous step.
 * @param overrides   Optional partial overrides applied last.
 */
// eslint-disable-next-line max-params -- test factory helper with positional args for readability
export function makeStep(
  step: number,
  label: string,
  eventName: string,
  count: number,
  totalCount: number,
  prevCount: number,
  overrides: Partial<FunnelStepResult> = {},
): FunnelStepResult {
  const isFirst = step === 1;
  const conversionRate = isFirst
    ? 100
    : totalCount > 0
      ? Math.round((count / totalCount) * 1000) / 10
      : 0;
  const dropOff = isFirst ? 0 : prevCount - count;
  const dropOffRate =
    prevCount > 0 && !isFirst
      ? Math.round((dropOff / prevCount) * 1000) / 10
      : 0;
  return {
    step,
    label,
    event_name: eventName,
    count,
    conversion_rate: conversionRate,
    drop_off: dropOff,
    drop_off_rate: dropOffRate,
    avg_time_to_convert_seconds: null,
    ...overrides,
  };
}

// Datasets

/** Minimal two-step funnel: Landing → Sign Up. */
export const TWO_STEPS: FunnelStepResult[] = [
  makeStep(1, 'Landing Page', '$pageview', 5000, 5000, 5000),
  makeStep(2, 'Sign Up', 'sign_up', 1250, 5000, 5000),
];

/** Five-step conversion funnel with realistic drop-off. */
export const FIVE_STEPS: FunnelStepResult[] = [
  makeStep(1, 'Landing Page', '$pageview', 10000, 10000, 10000),
  makeStep(2, 'View Pricing', 'view_pricing', 6200, 10000, 10000),
  makeStep(3, 'Start Trial', 'start_trial', 3100, 10000, 6200),
  makeStep(4, 'Add Payment', 'add_payment', 1400, 10000, 3100),
  makeStep(5, 'Subscribe', 'subscribe', 820, 10000, 1400),
];

/** Four-step e-commerce funnel for compact widget previews. */
export const COMPACT_STEPS: FunnelStepResult[] = [
  makeStep(1, 'Homepage', '$pageview', 8400, 8400, 8400),
  makeStep(2, 'Product', 'view_product', 3200, 8400, 8400),
  makeStep(3, 'Cart', 'add_to_cart', 1100, 8400, 3200),
  makeStep(4, 'Checkout', 'checkout', 490, 8400, 1100),
];

// Breakdown helpers

function makeBreakdownGroup(
  breakdownValue: string,
  counts: number[],
  total: number,
): FunnelStepResult[] {
  const labels = ['Landing Page', 'Sign Up', 'Activate', 'Subscribe'];
  const events = ['$pageview', 'sign_up', 'activate', 'subscribe'];
  return counts.map((count, i) => ({
    ...makeStep(
      i + 1,
      labels[i],
      events[i],
      count,
      total,
      counts[i - 1] ?? total,
    ),
    breakdown_value: breakdownValue,
  }));
}

/** Per-breakdown steps flattened for the FunnelChart `breakdown` prop. */
export const BREAKDOWN_STEPS: FunnelStepResult[] = [
  ...makeBreakdownGroup('Organic', [4200, 1890, 820, 340], 4200),
  ...makeBreakdownGroup('Paid Search', [3100, 1580, 720, 310], 3100),
  ...makeBreakdownGroup('Referral', [1800, 900, 420, 210], 1800),
];

/** Aggregate (total) steps for the breakdown view. */
export const BREAKDOWN_AGGREGATE: FunnelStepResult[] = [
  makeStep(1, 'Landing Page', '$pageview', 9100, 9100, 9100),
  makeStep(2, 'Sign Up', 'sign_up', 4370, 9100, 9100),
  makeStep(3, 'Activate', 'activate', 1960, 9100, 4370),
  makeStep(4, 'Subscribe', 'subscribe', 860, 9100, 1960),
];
