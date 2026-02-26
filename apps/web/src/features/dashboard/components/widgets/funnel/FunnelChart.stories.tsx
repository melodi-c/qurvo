import type { Meta, StoryObj } from '@storybook/react';
import type { FunnelStepResult, TimeToConvertBin } from '@/api/generated/Api';
import { FunnelChart } from './FunnelChart';
import { TimeToConvertChart } from './TimeToConvertChart';

// ---------------------------------------------------------------------------
// Helpers — build typed step fixtures
// ---------------------------------------------------------------------------

function makeStep(
  step: number,
  label: string,
  eventName: string,
  count: number,
  totalCount: number,
  prevCount: number,
  overrides: Partial<FunnelStepResult> = {},
): FunnelStepResult {
  const isFirst = step === 1;
  const conversionRate = isFirst ? 100 : totalCount > 0 ? Math.round((count / totalCount) * 1000) / 10 : 0;
  const dropOff = isFirst ? 0 : prevCount - count;
  const dropOffRate = prevCount > 0 && !isFirst ? Math.round((dropOff / prevCount) * 1000) / 10 : 0;
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

// ---------------------------------------------------------------------------
// Datasets
// ---------------------------------------------------------------------------

const TWO_STEPS: FunnelStepResult[] = [
  makeStep(1, 'Landing Page', '$pageview', 5000, 5000, 5000),
  makeStep(2, 'Sign Up', 'sign_up', 1250, 5000, 5000),
];

const FIVE_STEPS: FunnelStepResult[] = [
  makeStep(1, 'Landing Page', '$pageview', 10000, 10000, 10000),
  makeStep(2, 'View Pricing', 'view_pricing', 6200, 10000, 10000),
  makeStep(3, 'Start Trial', 'start_trial', 3100, 10000, 6200),
  makeStep(4, 'Add Payment', 'add_payment', 1400, 10000, 3100),
  makeStep(5, 'Subscribe', 'subscribe', 820, 10000, 1400),
];

const COMPACT_STEPS: FunnelStepResult[] = [
  makeStep(1, 'Homepage', '$pageview', 8400, 8400, 8400),
  makeStep(2, 'Product', 'view_product', 3200, 8400, 8400),
  makeStep(3, 'Cart', 'add_to_cart', 1100, 8400, 3200),
  makeStep(4, 'Checkout', 'checkout', 490, 8400, 1100),
];

// Breakdown steps — each step has entries per breakdown value
function makeBreakdownSteps(
  breakdown_value: string,
  counts: number[],
  total: number,
): FunnelStepResult[] {
  const labels = ['Landing Page', 'Sign Up', 'Activate', 'Subscribe'];
  const events = ['$pageview', 'sign_up', 'activate', 'subscribe'];
  return counts.map((count, i) => ({
    ...makeStep(i + 1, labels[i], events[i], count, total, counts[i - 1] ?? total),
    breakdown_value,
  }));
}

const BREAKDOWN_STEPS: FunnelStepResult[] = [
  ...makeBreakdownSteps('Organic', [4200, 1890, 820, 340], 4200),
  ...makeBreakdownSteps('Paid Search', [3100, 1580, 720, 310], 3100),
  ...makeBreakdownSteps('Referral', [1800, 900, 420, 210], 1800),
];

// Aggregate steps for breakdown (totals across all groups)
const BREAKDOWN_AGGREGATE: FunnelStepResult[] = [
  makeStep(1, 'Landing Page', '$pageview', 9100, 9100, 9100),
  makeStep(2, 'Sign Up', 'sign_up', 4370, 9100, 9100),
  makeStep(3, 'Activate', 'activate', 1960, 9100, 4370),
  makeStep(4, 'Subscribe', 'subscribe', 860, 9100, 1960),
];

// Time-to-convert bins (seconds → bin boundaries)
const TIME_BINS: TimeToConvertBin[] = [
  { from_seconds: 0, to_seconds: 30, count: 312 },
  { from_seconds: 30, to_seconds: 60, count: 487 },
  { from_seconds: 60, to_seconds: 300, count: 623 },
  { from_seconds: 300, to_seconds: 900, count: 418 },
  { from_seconds: 900, to_seconds: 3600, count: 271 },
  { from_seconds: 3600, to_seconds: 10800, count: 145 },
  { from_seconds: 10800, to_seconds: 86400, count: 89 },
  { from_seconds: 86400, to_seconds: 259200, count: 42 },
];

// ---------------------------------------------------------------------------
// FunnelChart meta
// ---------------------------------------------------------------------------

const meta: Meta<typeof FunnelChart> = {
  title: 'Dashboard/FunnelChart',
  component: FunnelChart,
};

export default meta;
type Story = StoryObj<typeof FunnelChart>;

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

export const TwoSteps: Story = {
  render: () => (
    <div className="p-6 bg-background">
      <FunnelChart steps={TWO_STEPS} />
    </div>
  ),
};

export const FiveSteps: Story = {
  render: () => (
    <div className="p-6 bg-background">
      <FunnelChart steps={FIVE_STEPS} />
    </div>
  ),
};

export const CompactMode: Story = {
  render: () => (
    <div className="p-4 bg-background border border-border rounded-lg" style={{ width: 480 }}>
      <FunnelChart steps={COMPACT_STEPS} compact />
    </div>
  ),
};

export const WithBreakdown: Story = {
  render: () => (
    <div className="p-6 bg-background">
      <FunnelChart
        steps={BREAKDOWN_STEPS}
        breakdown
        aggregateSteps={BREAKDOWN_AGGREGATE}
      />
    </div>
  ),
};

export const RelativeMode: Story = {
  render: () => (
    <div className="p-6 bg-background space-y-8">
      <div>
        <p className="text-sm text-muted-foreground mb-4">Total (absolute from step 1)</p>
        <FunnelChart steps={FIVE_STEPS} conversionRateDisplay="total" />
      </div>
      <div>
        <p className="text-sm text-muted-foreground mb-4">Relative (step-to-step)</p>
        <FunnelChart steps={FIVE_STEPS} conversionRateDisplay="relative" />
      </div>
    </div>
  ),
};

// ---------------------------------------------------------------------------
// TimeToConvertChart stories
// ---------------------------------------------------------------------------

type TimeToConvertStory = StoryObj<typeof TimeToConvertChart>;

export const TimeToConvert: TimeToConvertStory = {
  render: () => (
    <div className="p-6 bg-background" style={{ width: 640 }}>
      <TimeToConvertChart bins={TIME_BINS} />
    </div>
  ),
};

export const TimeToConvertEmpty: TimeToConvertStory = {
  render: () => (
    <div className="p-6 bg-background" style={{ width: 640 }}>
      <TimeToConvertChart bins={[]} />
    </div>
  ),
};
