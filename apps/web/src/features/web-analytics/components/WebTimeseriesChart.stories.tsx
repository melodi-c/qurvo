import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { TIMESERIES_30D } from '@/stories/mocks/web-analytics.mock';
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

export const Visitors: Story = {
  render: () => {
    const [metric, setMetric] = useState<MetricKey>('unique_visitors');
    return (
      <div className="max-w-2xl">
        <WebTimeseriesChart
          data={TIMESERIES_30D}
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
          data={TIMESERIES_30D}
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
          data={TIMESERIES_30D}
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
          data={TIMESERIES_30D}
          granularity="day"
          isLoading={false}
          metric={metric}
          onMetricChange={setMetric}
        />
      </div>
    );
  },
};
