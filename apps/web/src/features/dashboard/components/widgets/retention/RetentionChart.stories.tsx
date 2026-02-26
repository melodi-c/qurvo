import type { Meta, StoryObj } from '@storybook/react';
import {
  RETENTION_DAY_RESULT,
  RETENTION_WEEK_RESULT,
} from '@/stories/mocks/retention.mock';
import { RetentionChart } from './RetentionChart';

const meta: Meta<typeof RetentionChart> = {
  title: 'Widgets/RetentionChart',
  component: RetentionChart,
  tags: ['autodocs'],
  argTypes: {
    compact: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof RetentionChart>;

export const DayGranularity: Story = {
  render: () => (
    <div className="w-full border border-border rounded-lg p-4">
      <RetentionChart result={RETENTION_DAY_RESULT} />
    </div>
  ),
};

export const WeekGranularity: Story = {
  render: () => (
    <div className="w-full border border-border rounded-lg p-4">
      <RetentionChart result={RETENTION_WEEK_RESULT} />
    </div>
  ),
};

export const CompactMode: Story = {
  render: () => (
    <div className="w-full border border-border rounded-lg p-4">
      <RetentionChart result={RETENTION_WEEK_RESULT} compact />
    </div>
  ),
};

export const CompactDayGranularity: Story = {
  render: () => (
    <div className="w-full border border-border rounded-lg p-4">
      <RetentionChart result={RETENTION_DAY_RESULT} compact />
    </div>
  ),
};
