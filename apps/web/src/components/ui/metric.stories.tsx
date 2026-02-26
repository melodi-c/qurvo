import type { Meta, StoryObj } from '@storybook/react';
import { Metric } from './metric';
import { MetricsDivider } from './metrics-divider';

const meta: Meta<typeof Metric> = {
  title: 'UI/Metric',
  component: Metric,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Metric>;

export const Default: Story = {
  args: {
    label: 'Total Events',
    value: '12,345',
  },
};

export const Accented: Story = {
  args: {
    label: 'Conversion Rate',
    value: '23.4%',
    accent: true,
  },
};

export const Group: Story = {
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

export const LargeNumbers: Story = {
  render: () => (
    <div className="flex items-center gap-8 px-4 py-3">
      <Metric label="Total Events" value="1,234,567" />
      <Metric label="Unique Users" value="98,765" />
      <Metric label="Avg. Duration" value="2m 15s" />
    </div>
  ),
};
