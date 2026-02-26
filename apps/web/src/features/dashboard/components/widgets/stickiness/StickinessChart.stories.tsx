import type { Meta, StoryObj } from '@storybook/react';
import type { StickinessResult } from '@/api/generated/Api';
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

const multiSeriesData: StickinessResult = {
  granularity: 'day',
  total_periods: 30,
  data: [
    { period_count: 1, user_count: 520 },
    { period_count: 2, user_count: 310 },
    { period_count: 3, user_count: 198 },
    { period_count: 4, user_count: 145 },
    { period_count: 5, user_count: 112 },
    { period_count: 6, user_count: 87 },
    { period_count: 7, user_count: 74 },
    { period_count: 8, user_count: 61 },
    { period_count: 9, user_count: 53 },
    { period_count: 10, user_count: 48 },
    { period_count: 11, user_count: 39 },
    { period_count: 12, user_count: 34 },
    { period_count: 13, user_count: 28 },
    { period_count: 14, user_count: 21 },
  ],
};

const singleSeriesData: StickinessResult = {
  granularity: 'week',
  total_periods: 4,
  data: [
    { period_count: 1, user_count: 248 },
    { period_count: 2, user_count: 91 },
    { period_count: 3, user_count: 37 },
    { period_count: 4, user_count: 12 },
  ],
};

const monthlyData: StickinessResult = {
  granularity: 'month',
  total_periods: 6,
  data: [
    { period_count: 1, user_count: 840 },
    { period_count: 2, user_count: 530 },
    { period_count: 3, user_count: 320 },
    { period_count: 4, user_count: 195 },
    { period_count: 5, user_count: 98 },
    { period_count: 6, user_count: 42 },
  ],
};

export const Default: Story = {
  args: {
    result: multiSeriesData,
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
    result: multiSeriesData,
    compact: true,
  },
};

export const SingleSeries: Story = {
  name: 'SingleSeries (weekly, 4 periods)',
  args: {
    result: singleSeriesData,
    compact: false,
  },
};

export const MultiSeries: Story = {
  name: 'MultiSeries (daily, 14 periods)',
  args: {
    result: multiSeriesData,
    compact: false,
  },
};

export const MonthlyGranularity: Story = {
  args: {
    result: monthlyData,
    compact: false,
  },
};
