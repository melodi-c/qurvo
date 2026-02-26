import type { Meta, StoryObj } from '@storybook/react';
import type { LifecycleResult } from '@/api/generated/Api';
import { LifecycleChart } from './LifecycleChart';

const meta: Meta<typeof LifecycleChart> = {
  title: 'Charts/LifecycleChart',
  component: LifecycleChart,
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
type Story = StoryObj<typeof LifecycleChart>;

const baseData: LifecycleResult = {
  granularity: 'day',
  totals: { new: 420, returning: 310, resurrecting: 95, dormant: -185 },
  data: [
    { bucket: '2025-02-01T00:00:00.000Z', new: 42, returning: 38, resurrecting: 8, dormant: -12 },
    { bucket: '2025-02-02T00:00:00.000Z', new: 55, returning: 41, resurrecting: 10, dormant: -18 },
    { bucket: '2025-02-03T00:00:00.000Z', new: 38, returning: 29, resurrecting: 6, dormant: -22 },
    { bucket: '2025-02-04T00:00:00.000Z', new: 61, returning: 47, resurrecting: 14, dormant: -9 },
    { bucket: '2025-02-05T00:00:00.000Z', new: 49, returning: 35, resurrecting: 11, dormant: -31 },
    { bucket: '2025-02-06T00:00:00.000Z', new: 72, returning: 58, resurrecting: 18, dormant: -15 },
    { bucket: '2025-02-07T00:00:00.000Z', new: 103, returning: 62, resurrecting: 28, dormant: -78 },
  ],
};

const weeklyData: LifecycleResult = {
  granularity: 'week',
  totals: { new: 540, returning: 420, resurrecting: 110, dormant: -230 },
  data: [
    { bucket: '2025-01-06T00:00:00.000Z', new: 120, returning: 95, resurrecting: 22, dormant: -48 },
    { bucket: '2025-01-13T00:00:00.000Z', new: 98, returning: 81, resurrecting: 19, dormant: -63 },
    { bucket: '2025-01-20T00:00:00.000Z', new: 145, returning: 112, resurrecting: 31, dormant: -55 },
    { bucket: '2025-01-27T00:00:00.000Z', new: 177, returning: 132, resurrecting: 38, dormant: -64 },
  ],
};

const allStatesData: LifecycleResult = {
  granularity: 'day',
  totals: { new: 380, returning: 290, resurrecting: 110, dormant: -200 },
  data: [
    { bucket: '2025-02-01T00:00:00.000Z', new: 85, returning: 62, resurrecting: 28, dormant: -45 },
    { bucket: '2025-02-02T00:00:00.000Z', new: 52, returning: 49, resurrecting: 21, dormant: -38 },
    { bucket: '2025-02-03T00:00:00.000Z', new: 71, returning: 55, resurrecting: 18, dormant: -52 },
    { bucket: '2025-02-04T00:00:00.000Z', new: 40, returning: 38, resurrecting: 15, dormant: -29 },
    { bucket: '2025-02-05T00:00:00.000Z', new: 132, returning: 86, resurrecting: 28, dormant: -36 },
  ],
};

export const FullMode: Story = {
  args: {
    result: baseData,
    compact: false,
  },
};

export const CompactMode: Story = {
  decorators: [
    (Story) => (
      <div className="w-[400px] h-[200px] bg-background p-3 rounded-lg border border-border">
        <Story />
      </div>
    ),
  ],
  args: {
    result: baseData,
    compact: true,
  },
};

export const AllLifecycleStates: Story = {
  name: 'AllLifecycleStates (new/returning/resurrecting/dormant)',
  args: {
    result: allStatesData,
    compact: false,
  },
};

export const WeeklyGranularity: Story = {
  args: {
    result: weeklyData,
    compact: false,
  },
};
