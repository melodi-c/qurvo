import type { Meta, StoryObj } from '@storybook/react';
import type { TimeToConvertBin } from '@/api/generated/Api';
import {
  TWO_STEPS,
  FIVE_STEPS,
  COMPACT_STEPS,
  BREAKDOWN_STEPS,
  BREAKDOWN_AGGREGATE,
} from '@/stories/mocks/funnel.mock';
import { FunnelChart } from './FunnelChart';
import { TimeToConvertChart } from './TimeToConvertChart';

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

const meta: Meta<typeof FunnelChart> = {
  title: 'Dashboard/FunnelChart',
  component: FunnelChart,
};

export default meta;
type Story = StoryObj<typeof FunnelChart>;

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
