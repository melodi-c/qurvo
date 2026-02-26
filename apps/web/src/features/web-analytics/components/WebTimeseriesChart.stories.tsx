import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import type { MetricKey } from './WebTimeseriesChart';
import { WebTimeseriesChart } from './WebTimeseriesChart';

const meta: Meta = {
  title: 'WebAnalytics/WebTimeseriesChart',
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj;

/** Generate daily ISO buckets ending today, going back `days` days. */
function makeDailyBuckets(days: number): string[] {
  const buckets: string[] = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    buckets.push(d.toISOString());
  }
  return buckets;
}

const buckets = makeDailyBuckets(30);

const timeseriesData = buckets.map((bucket, i) => ({
  bucket,
  unique_visitors: 800 + Math.round(Math.sin(i * 0.4) * 200 + Math.random() * 150),
  pageviews: 2000 + Math.round(Math.sin(i * 0.35) * 500 + Math.random() * 300),
  sessions: 1100 + Math.round(Math.sin(i * 0.45) * 250 + Math.random() * 180),
}));

export const Visitors: Story = {
  render: () => {
    const [metric, setMetric] = useState<MetricKey>('unique_visitors');
    return (
      <div className="max-w-2xl">
        <WebTimeseriesChart
          data={timeseriesData}
          granularity="day"
          isLoading={false}
          metric={metric}
          onMetricChange={setMetric}
        />
      </div>
    );
  },
};

export const Pageviews: Story = {
  render: () => {
    const [metric, setMetric] = useState<MetricKey>('pageviews');
    return (
      <div className="max-w-2xl">
        <WebTimeseriesChart
          data={timeseriesData}
          granularity="day"
          isLoading={false}
          metric={metric}
          onMetricChange={setMetric}
        />
      </div>
    );
  },
};

export const Sessions: Story = {
  render: () => {
    const [metric, setMetric] = useState<MetricKey>('sessions');
    return (
      <div className="max-w-2xl">
        <WebTimeseriesChart
          data={timeseriesData}
          granularity="day"
          isLoading={false}
          metric={metric}
          onMetricChange={setMetric}
        />
      </div>
    );
  },
};

export const Loading: Story = {
  render: () => {
    const [metric, setMetric] = useState<MetricKey>('unique_visitors');
    return (
      <div className="max-w-2xl">
        <WebTimeseriesChart
          data={undefined}
          granularity="day"
          isLoading={true}
          metric={metric}
          onMetricChange={setMetric}
        />
      </div>
    );
  },
};

export const Interactive: Story = {
  name: 'Interactive — toggle metrics',
  render: () => {
    const [metric, setMetric] = useState<MetricKey>('unique_visitors');
    return (
      <div className="max-w-2xl">
        <WebTimeseriesChart
          data={timeseriesData}
          granularity="day"
          isLoading={false}
          metric={metric}
          onMetricChange={setMetric}
        />
      </div>
    );
  },
};
