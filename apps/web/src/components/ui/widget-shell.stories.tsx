import type { Meta, StoryObj } from '@storybook/react';
import type { WidgetDataResult } from '@/features/dashboard/hooks/create-widget-data-hook';
import { WidgetShell } from '@/features/dashboard/components/widgets/WidgetShell';

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
      >
        <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
          Chart content (fading during refetch)
        </div>
      </WidgetShell>
    </div>
  ),
};
