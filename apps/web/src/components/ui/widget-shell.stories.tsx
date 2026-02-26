import type { Meta, StoryObj } from '@storybook/react';
import type { WidgetDataResult } from '@/features/dashboard/hooks/create-widget-data-hook';
import { WidgetShell } from '@/features/dashboard/components/widgets/WidgetShell';
import { Metric } from './metric';
import { MetricsDivider } from './metrics-divider';

interface SampleData {
  cached_at: string;
  value: number;
}

function makeQuery(overrides: Partial<WidgetDataResult<SampleData>> = {}): WidgetDataResult<SampleData> {
  return {
    data: undefined,
    isLoading: false,
    isFetching: false,
    isPlaceholderData: false,
    error: null,
    refresh: async () => undefined,
    ...overrides,
  };
}

const sampleData: SampleData = {
  cached_at: new Date().toISOString(),
  value: 1234,
};

const sampleMetric = <Metric label="Total Events" value="1,234" />;

const meta: Meta = {
  title: 'UI/WidgetShell',
};

export default meta;

type Story = StoryObj;

export const Loading: Story = {
  render: () => (
    <div className="h-64 border border-border rounded-lg p-4">
      <WidgetShell
        query={makeQuery({ isLoading: true })}
        isConfigValid={true}
        isEmpty={false}
        metric={sampleMetric}
      >
        <div />
      </WidgetShell>
    </div>
  ),
};

export const LoadError: Story = {
  render: () => (
    <div className="h-64 border border-border rounded-lg p-4">
      <WidgetShell
        query={makeQuery({ error: new Error('Failed to load data') })}
        isConfigValid={true}
        isEmpty={false}
        metric={sampleMetric}
      >
        <div />
      </WidgetShell>
    </div>
  ),
};

export const NotConfigured: Story = {
  render: () => (
    <div className="h-64 border border-border rounded-lg p-4">
      <WidgetShell
        query={makeQuery()}
        isConfigValid={false}
        isEmpty={false}
        metric={sampleMetric}
        configureMessage="Select an event to display data."
      >
        <div />
      </WidgetShell>
    </div>
  ),
};

export const Empty: Story = {
  render: () => (
    <div className="h-64 border border-border rounded-lg p-4">
      <WidgetShell
        query={makeQuery({ data: { ...sampleData, value: 0 } })}
        isConfigValid={true}
        isEmpty={true}
        emptyMessage="No data for this period."
        emptyHint="Try widening your date range."
        metric={sampleMetric}
      >
        <div />
      </WidgetShell>
    </div>
  ),
};

export const WithData: Story = {
  render: () => (
    <div className="h-64 border border-border rounded-lg p-4">
      <WidgetShell
        query={makeQuery({ data: sampleData })}
        isConfigValid={true}
        isEmpty={false}
        metric={<Metric label="Total Events" value="1,234" accent />}
        metricSecondary={
          <>
            <MetricsDivider />
            <Metric label="Unique Users" value="892" />
          </>
        }
        cachedAt={sampleData.cached_at}
        fromCache={false}
      >
        <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
          Chart goes here
        </div>
      </WidgetShell>
    </div>
  ),
};

export const Fetching: Story = {
  render: () => (
    <div className="h-64 border border-border rounded-lg p-4">
      <WidgetShell
        query={makeQuery({ data: sampleData, isFetching: true })}
        isConfigValid={true}
        isEmpty={false}
        metric={<Metric label="Total Events" value="1,234" />}
        cachedAt={sampleData.cached_at}
        fromCache={true}
      >
        <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
          Chart content (fading during refetch)
        </div>
      </WidgetShell>
    </div>
  ),
};
