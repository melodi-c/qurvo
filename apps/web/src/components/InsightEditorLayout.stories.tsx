import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { BarChart2, GitMerge, Users } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Metric } from '@/components/ui/metric';
import { MetricsDivider } from '@/components/ui/metrics-divider';
import { QueryPanelShell } from '@/components/ui/query-panel-shell';
import { InsightEditorLayout } from './InsightEditorLayout';

// ---------------------------------------------------------------------------
// Shared mock query panel
// ---------------------------------------------------------------------------

function MockQueryPanel() {
  return (
    <QueryPanelShell>
      <div className="space-y-3">
        <div className="h-4 w-24 rounded bg-muted/40" />
        <div className="h-8 w-full rounded bg-muted/30" />
        <div className="h-8 w-full rounded bg-muted/30" />
      </div>
      <div className="space-y-3">
        <div className="h-4 w-20 rounded bg-muted/40" />
        <div className="h-8 w-full rounded bg-muted/30" />
        <div className="h-8 w-3/4 rounded bg-muted/30" />
      </div>
    </QueryPanelShell>
  );
}

// ---------------------------------------------------------------------------
// Shared skeleton
// ---------------------------------------------------------------------------

function MockSkeleton() {
  return (
    <>
      <div className="flex gap-8">
        <Skeleton className="h-10 w-28" />
        <Skeleton className="h-10 w-28" />
      </div>
      <Skeleton className="h-[300px] w-full" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Shared metrics bar
// ---------------------------------------------------------------------------

function MockMetricsBar() {
  return (
    <>
      <Metric label="Total Events" value="42,130" accent />
      <MetricsDivider />
      <Metric label="Unique Users" value="8,920" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Mock chart
// ---------------------------------------------------------------------------

function MockChart() {
  return (
    <div className="h-64 flex items-center justify-center border border-dashed border-border/50 rounded-lg text-muted-foreground text-sm">
      Chart content
    </div>
  );
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta: Meta = {
  title: 'Components/InsightEditorLayout',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    memoryRouter: {
      initialEntries: ['/projects/proj-demo/trends/new'],
      path: '/projects/:projectId/trends/new',
    },
  },
};

export default meta;
type Story = StoryObj;

// ---------------------------------------------------------------------------
// 4 canonical states
// ---------------------------------------------------------------------------

/**
 * Configure state — query is not yet configured.
 * isConfigValid=false shows "configure" EmptyState.
 */
export const Configure: Story = {
  render: () => {
    const [name, setName] = useState('');
    return (
      <InsightEditorLayout
        backPath="/projects/proj-demo/trends"
        backLabel="Trends"
        name={name}
        onNameChange={setName}
        placeholder="Untitled trend"
        onSave={() => {}}
        isSaving={false}
        isValid={false}
        queryPanel={<MockQueryPanel />}
        isConfigValid={false}
        showSkeleton={false}
        isEmpty={false}
        isFetching={false}
        configureIcon={BarChart2}
        configureTitle="Configure your trend"
        configureDescription="Select at least one event to run the query."
        noResultsIcon={BarChart2}
        noResultsTitle="No results"
        noResultsDescription="No events matched your filters."
        skeleton={<MockSkeleton />}
        metricsBar={<MockMetricsBar />}
      >
        <MockChart />
      </InsightEditorLayout>
    );
  },
};

/**
 * Loading state — query is valid and loading.
 * isConfigValid=true + showSkeleton=true shows skeleton inside the results area.
 */
export const Loading: Story = {
  render: () => {
    const [name, setName] = useState('Daily Active Users');
    return (
      <InsightEditorLayout
        backPath="/projects/proj-demo/trends"
        backLabel="Trends"
        name={name}
        onNameChange={setName}
        placeholder="Untitled trend"
        onSave={() => {}}
        isSaving={false}
        isValid={true}
        queryPanel={<MockQueryPanel />}
        isConfigValid={true}
        showSkeleton={true}
        isEmpty={false}
        isFetching={false}
        noResultsIcon={BarChart2}
        noResultsTitle="No results"
        noResultsDescription="No events matched your filters."
        skeleton={<MockSkeleton />}
        metricsBar={<MockMetricsBar />}
      >
        <MockChart />
      </InsightEditorLayout>
    );
  },
};

/**
 * Empty state — query returned no data.
 * isConfigValid=true + showSkeleton=false + isEmpty=true shows "no results" EmptyState.
 */
export const Empty: Story = {
  render: () => {
    const [name, setName] = useState('Activation Funnel');
    return (
      <InsightEditorLayout
        backPath="/projects/proj-demo/trends"
        backLabel="Trends"
        name={name}
        onNameChange={setName}
        placeholder="Untitled trend"
        onSave={() => {}}
        isSaving={false}
        isValid={true}
        queryPanel={<MockQueryPanel />}
        isConfigValid={true}
        showSkeleton={false}
        isEmpty={true}
        isFetching={false}
        noResultsIcon={GitMerge}
        noResultsTitle="No events found"
        noResultsDescription="There were no events matching the selected criteria for this period."
        skeleton={<MockSkeleton />}
        metricsBar={<MockMetricsBar />}
      >
        <MockChart />
      </InsightEditorLayout>
    );
  },
};

/**
 * Results state — query returned data and chart is displayed.
 * isConfigValid=true + showSkeleton=false + isEmpty=false shows metrics bar + chart.
 */
export const Results: Story = {
  render: () => {
    const [name, setName] = useState('Daily Active Users');
    return (
      <InsightEditorLayout
        backPath="/projects/proj-demo/trends"
        backLabel="Trends"
        name={name}
        onNameChange={setName}
        placeholder="Untitled trend"
        onSave={() => {}}
        isSaving={false}
        isValid={true}
        queryPanel={<MockQueryPanel />}
        isConfigValid={true}
        showSkeleton={false}
        isEmpty={false}
        isFetching={false}
        noResultsIcon={BarChart2}
        noResultsTitle="No results"
        noResultsDescription="No events matched your filters."
        skeleton={<MockSkeleton />}
        metricsBar={<MockMetricsBar />}
      >
        <MockChart />
      </InsightEditorLayout>
    );
  },
};

/** Results with CSV export button. */
export const ResultsWithExport: Story = {
  render: () => {
    const [name, setName] = useState('Sign-up Funnel');
    return (
      <InsightEditorLayout
        backPath="/projects/proj-demo/trends"
        backLabel="Trends"
        name={name}
        onNameChange={setName}
        placeholder="Untitled trend"
        onSave={() => {}}
        isSaving={false}
        isValid={true}
        queryPanel={<MockQueryPanel />}
        isConfigValid={true}
        showSkeleton={false}
        isEmpty={false}
        isFetching={false}
        noResultsIcon={Users}
        noResultsTitle="No results"
        noResultsDescription="No events matched your filters."
        skeleton={<MockSkeleton />}
        metricsBar={<MockMetricsBar />}
        onExportCsv={() => alert('Export CSV')}
      >
        <MockChart />
      </InsightEditorLayout>
    );
  },
};

/** Refetching state — data is displayed but opacity is reduced during background refetch. */
export const Refetching: Story = {
  render: () => {
    const [name, setName] = useState('Retention Analysis');
    return (
      <InsightEditorLayout
        backPath="/projects/proj-demo/trends"
        backLabel="Trends"
        name={name}
        onNameChange={setName}
        placeholder="Untitled trend"
        onSave={() => {}}
        isSaving={false}
        isValid={true}
        queryPanel={<MockQueryPanel />}
        isConfigValid={true}
        showSkeleton={false}
        isEmpty={false}
        isFetching={true}
        noResultsIcon={BarChart2}
        noResultsTitle="No results"
        noResultsDescription="No events matched your filters."
        skeleton={<MockSkeleton />}
        metricsBar={<MockMetricsBar />}
      >
        <MockChart />
      </InsightEditorLayout>
    );
  },
};

/** Saving state — save button shows spinner. */
export const Saving: Story = {
  render: () => (
    <InsightEditorLayout
      backPath="/projects/proj-demo/trends"
      backLabel="Trends"
      name="My Trend"
      onNameChange={() => {}}
      placeholder="Untitled trend"
      onSave={() => {}}
      isSaving={true}
      isValid={true}
      queryPanel={<MockQueryPanel />}
      isConfigValid={true}
      showSkeleton={false}
      isEmpty={false}
      isFetching={false}
      noResultsIcon={BarChart2}
      noResultsTitle="No results"
      noResultsDescription="No events matched your filters."
      skeleton={<MockSkeleton />}
      metricsBar={<MockMetricsBar />}
    >
      <MockChart />
    </InsightEditorLayout>
  ),
};
