import type { Meta, StoryObj } from '@storybook/react';
import {
  STICKINESS_DAILY_14,
  STICKINESS_WEEKLY_4,
  STICKINESS_MONTHLY_6,
} from '@/stories/mocks/stickiness.mock';
import { StickinessChart } from './StickinessChart';

const meta: Meta<typeof StickinessChart> = {
  title: 'Charts/StickinessChart',
  component: StickinessChart,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="w-[800px] bg-background p-4 rounded-lg border border-border">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof StickinessChart>;

export const Default: Story = {
  args: {
    result: STICKINESS_DAILY_14,
    compact: false,
  },
};

export const CompactMode: Story = {
  decorators: [
    (Story) => (
      <div className="w-[400px] h-[180px] bg-background p-3 rounded-lg border border-border">
        <Story />
      </div>
    ),
  ],
  args: {
    result: STICKINESS_DAILY_14,
    compact: true,
  },
};

export const SingleSeries: Story = {
  name: 'SingleSeries (weekly, 4 periods)',
  args: {
    result: STICKINESS_WEEKLY_4,
    compact: false,
  },
};

export const MultiSeries: Story = {
  name: 'MultiSeries (daily, 14 periods)',
  args: {
    result: STICKINESS_DAILY_14,
    compact: false,
  },
};

export const MonthlyGranularity: Story = {
  args: {
    result: STICKINESS_MONTHLY_6,
    compact: false,
  },
};
