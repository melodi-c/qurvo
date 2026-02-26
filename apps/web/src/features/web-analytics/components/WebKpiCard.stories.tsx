import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { WebKpiCard } from './WebKpiCard';

const meta: Meta<typeof WebKpiCard> = {
  title: 'WebAnalytics/WebKpiCard',
  component: WebKpiCard,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof WebKpiCard>;

export const Increased: Story = {
  args: {
    label: 'Unique Visitors',
    value: '12.4K',
    currentValue: 12400,
    previousValue: 10200,
  },
};

export const Decreased: Story = {
  args: {
    label: 'Unique Visitors',
    value: '8.1K',
    currentValue: 8100,
    previousValue: 10200,
  },
};

export const Neutral: Story = {
  args: {
    label: 'Unique Visitors',
    value: '10.2K',
    currentValue: 10200,
    previousValue: 10200,
  },
};

export const InvertedSentiment: Story = {
  name: 'InvertedSentiment (Bounce Rate)',
  render: () => (
    <div className="w-48">
      <WebKpiCard
        label="Bounce Rate"
        value="42.0%"
        currentValue={42}
        previousValue={50}
        invertSentiment
        formatDelta={(cur, prev) => {
          if (prev === 0) return cur > 0 ? '+100%' : '0%';
          const diff = cur - prev;
          const sign = diff >= 0 ? '+' : '';
          return `${sign}${diff.toFixed(1)}pp`;
        }}
      />
    </div>
  ),
};

export const InvertedSentimentBad: Story = {
  name: 'InvertedSentiment — Rate Increased (bad)',
  render: () => (
    <div className="w-48">
      <WebKpiCard
        label="Bounce Rate"
        value="58.0%"
        currentValue={58}
        previousValue={50}
        invertSentiment
        formatDelta={(cur, prev) => {
          if (prev === 0) return cur > 0 ? '+100%' : '0%';
          const diff = cur - prev;
          const sign = diff >= 0 ? '+' : '';
          return `${sign}${diff.toFixed(1)}pp`;
        }}
      />
    </div>
  ),
};

export const AllStates: Story = {
  render: () => (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl">
      <WebKpiCard label="Visitors" value="12.4K" currentValue={12400} previousValue={10200} />
      <WebKpiCard label="Visitors" value="8.1K" currentValue={8100} previousValue={10200} />
      <WebKpiCard label="Visitors" value="10.2K" currentValue={10200} previousValue={10200} />
      <WebKpiCard
        label="Bounce Rate"
        value="42.0%"
        currentValue={42}
        previousValue={50}
        invertSentiment
        formatDelta={(cur, prev) => {
          const diff = cur - prev;
          const sign = diff >= 0 ? '+' : '';
          return `${sign}${diff.toFixed(1)}pp`;
        }}
      />
    </div>
  ),
};
