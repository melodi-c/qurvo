import type { Meta, StoryObj } from '@storybook/react';
import {
  LIFECYCLE_BASE,
  LIFECYCLE_WEEKLY,
  LIFECYCLE_ALL_STATES,
} from '@/stories/mocks/lifecycle.mock';
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

export const FullMode: Story = {
  args: {
    result: LIFECYCLE_BASE,
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
    result: LIFECYCLE_BASE,
    compact: true,
  },
};

export const AllLifecycleStates: Story = {
  name: 'AllLifecycleStates (new/returning/resurrecting/dormant)',
  args: {
    result: LIFECYCLE_ALL_STATES,
    compact: false,
  },
};

export const WeeklyGranularity: Story = {
  args: {
    result: LIFECYCLE_WEEKLY,
    compact: false,
  },
};
