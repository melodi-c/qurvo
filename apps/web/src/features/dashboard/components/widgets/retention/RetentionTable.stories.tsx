import type { Meta, StoryObj } from '@storybook/react';
import {
  RETENTION_DAY_RESULT_WITH_COHORTS,
  RETENTION_WEEK_RESULT_WITH_COHORTS,
} from '@/stories/mocks/retention.mock';
import { RetentionTable } from './RetentionTable';

const meta: Meta<typeof RetentionTable> = {
  title: 'Widgets/RetentionTable',
  component: RetentionTable,
  tags: ['autodocs'],
  argTypes: {
    compact: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof RetentionTable>;

export const WeeklyData: Story = {
  render: () => (
    <div className="overflow-x-auto border border-border rounded-lg">
      <RetentionTable result={RETENTION_WEEK_RESULT_WITH_COHORTS} />
    </div>
  ),
};

export const DailyData: Story = {
  render: () => (
    <div className="overflow-x-auto border border-border rounded-lg">
      <RetentionTable result={RETENTION_DAY_RESULT_WITH_COHORTS} />
    </div>
  ),
};

export const CompactMode: Story = {
  render: () => (
    <div className="overflow-x-auto border border-border rounded-lg">
      <RetentionTable result={RETENTION_WEEK_RESULT_WITH_COHORTS} compact />
    </div>
  ),
};

export const CompactDailyData: Story = {
  render: () => (
    <div className="overflow-x-auto border border-border rounded-lg">
      <RetentionTable result={RETENTION_DAY_RESULT_WITH_COHORTS} compact />
    </div>
  ),
};
