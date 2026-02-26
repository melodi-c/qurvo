import type { Meta, StoryObj } from '@storybook/react';
import { MetricsDivider } from './metrics-divider';
import { Metric } from './metric';

const meta: Meta<typeof MetricsDivider> = {
  title: 'UI/MetricsDivider',
  component: MetricsDivider,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof MetricsDivider>;

export const InMetricsRow: Story = {
  render: () => (
    <div className="flex items-center px-4 py-3">
      <Metric label="Total Users" value="1,284" />
      <MetricsDivider />
      <Metric label="Conversion Rate" value="18.3%" accent />
      <MetricsDivider />
      <Metric label="Avg. Session" value="4m 32s" />
    </div>
  ),
};

export const TwoMetrics: Story = {
  render: () => (
    <div className="flex items-center px-4 py-3">
      <Metric label="Events This Week" value="47,821" />
      <MetricsDivider />
      <Metric label="Unique Users" value="3,920" />
    </div>
  ),
};

export const FourMetrics: Story = {
  render: () => (
    <div className="flex items-center px-4 py-3">
      <Metric label="Step 1" value="10,000" />
      <MetricsDivider />
      <Metric label="Step 2" value="6,200" />
      <MetricsDivider />
      <Metric label="Step 3" value="3,450" />
      <MetricsDivider />
      <Metric label="Step 4" value="1,870" accent />
    </div>
  ),
};
