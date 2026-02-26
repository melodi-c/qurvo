import type { Meta, StoryObj } from '@storybook/react';
import type { RetentionResult } from '@/api/generated/Api';
import { RetentionChart } from './RetentionChart';

const dayResult: RetentionResult = {
  retention_type: 'first_time',
  granularity: 'day',
  average_retention: [100, 62.5, 45.2, 38.1, 31.7, 28.4, 25.0, 22.3, 20.1, 18.6, 17.2, 16.0, 15.1, 14.3],
  cohorts: [],
};

const weekResult: RetentionResult = {
  retention_type: 'first_time',
  granularity: 'week',
  average_retention: [100, 55.3, 41.8, 34.2, 29.7, 26.1, 23.4, 21.0],
  cohorts: [],
};

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
      <RetentionChart result={dayResult} />
    </div>
  ),
};

export const WeekGranularity: Story = {
  render: () => (
    <div className="w-full border border-border rounded-lg p-4">
      <RetentionChart result={weekResult} />
    </div>
  ),
};

export const CompactMode: Story = {
  render: () => (
    <div className="w-full border border-border rounded-lg p-4">
      <RetentionChart result={weekResult} compact />
    </div>
  ),
};

export const CompactDayGranularity: Story = {
  render: () => (
    <div className="w-full border border-border rounded-lg p-4">
      <RetentionChart result={dayResult} compact />
    </div>
  ),
};
