import type { Meta, StoryObj } from '@storybook/react';
import { StatRow } from './stat-row';

const meta: Meta<typeof StatRow> = {
  title: 'UI/StatRow',
  component: StatRow,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof StatRow>;

export const Default: Story = {
  args: {
    items: [
      { label: 'Winner', value: 'Segment A' },
      { label: 'Absolute diff', value: '+1,234' },
      { label: 'Relative diff', value: '+12.3%' },
    ],
  },
};

export const WithColoredValues: Story = {
  args: {
    items: [
      { label: 'Winner', value: 'Segment A' },
      { label: 'Absolute diff', value: '+1,234', valueClassName: 'text-emerald-400' },
      { label: 'Relative diff', value: '+12.3%', valueClassName: 'text-emerald-400' },
    ],
  },
};

export const NegativeValues: Story = {
  args: {
    items: [
      { label: 'Overall', value: '-5.2%', valueClassName: 'text-red-400' },
      { label: 'Sessions', value: '-234', valueClassName: 'text-red-400' },
    ],
  },
};

export const TwoItems: Story = {
  args: {
    items: [
      { label: 'Metric', value: 'page_views' },
      { label: 'Change', value: '+42', valueClassName: 'text-emerald-400' },
    ],
  },
};

export const ManyItems: Story = {
  args: {
    items: [
      { label: 'Visitors', value: '4,200' },
      { label: 'Pageviews', value: '6,100' },
      { label: 'Sessions', value: '5,300' },
      { label: 'Bounce rate', value: '42%' },
    ],
  },
};
