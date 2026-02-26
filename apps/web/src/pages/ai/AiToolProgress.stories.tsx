import type { Meta, StoryObj } from '@storybook/react';
import { AiToolProgress } from './ai-tool-progress';

const meta: Meta = {
  title: 'AI/AiToolProgress',
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj;

export const QueryTrend: Story = {
  name: 'QueryTrend — single event',
  render: () => (
    <AiToolProgress
      toolName="query_trend"
      toolArgs={{
        series: [{ event_name: '$pageview' }],
        granularity: 'day',
        date_from: '2026-01-28',
        date_to: '2026-02-27',
      }}
    />
  ),
};

export const QueryTrendMultiSeries: Story = {
  name: 'QueryTrend — multiple series',
  render: () => (
    <AiToolProgress
      toolName="query_trend"
      toolArgs={{
        series: [
          { event_name: '$pageview' },
          { event_name: '$identify' },
          { event_name: 'signup' },
        ],
        granularity: 'week',
        date_from: '2026-01-01',
        date_to: '2026-02-27',
      }}
    />
  ),
};

export const QueryFunnel: Story = {
  name: 'QueryFunnel — 3 steps',
  render: () => (
    <AiToolProgress
      toolName="query_funnel"
      toolArgs={{
        steps: [
          { event_name: '$pageview' },
          { event_name: 'signup_started' },
          { event_name: 'signup_completed' },
        ],
        date_from: '2026-01-28',
        date_to: '2026-02-27',
      }}
    />
  ),
};

export const QueryRetention: Story = {
  name: 'QueryRetention',
  render: () => (
    <AiToolProgress
      toolName="query_retention"
      toolArgs={{
        target_event: '$pageview',
        granularity: 'week',
        date_from: '2026-01-01',
        date_to: '2026-02-27',
      }}
    />
  ),
};

export const QueryLifecycle: Story = {
  name: 'QueryLifecycle',
  render: () => (
    <AiToolProgress
      toolName="query_lifecycle"
      toolArgs={{
        target_event: 'feature_used',
        granularity: 'day',
        date_from: '2026-01-28',
        date_to: '2026-02-27',
      }}
    />
  ),
};

export const QueryStickiness: Story = {
  name: 'QueryStickiness',
  render: () => (
    <AiToolProgress
      toolName="query_stickiness"
      toolArgs={{
        target_event: 'dashboard_viewed',
        granularity: 'week',
        date_from: '2026-01-01',
        date_to: '2026-02-27',
      }}
    />
  ),
};

export const QueryPaths: Story = {
  name: 'QueryPaths — with start/end event',
  render: () => (
    <AiToolProgress
      toolName="query_paths"
      toolArgs={{
        start_event: '$pageview',
        end_event: 'signup_completed',
        date_from: '2026-01-28',
        date_to: '2026-02-27',
      }}
    />
  ),
};

export const ListEventNames: Story = {
  name: 'ListEventNames',
  render: () => <AiToolProgress toolName="list_event_names" toolArgs={{}} />,
};

export const CreateInsight: Story = {
  name: 'CreateInsight',
  render: () => <AiToolProgress toolName="create_insight" toolArgs={{}} />,
};

export const SaveToDashboard: Story = {
  name: 'SaveToDashboard',
  render: () => <AiToolProgress toolName="save_to_dashboard" toolArgs={{}} />,
};

export const UnknownTool: Story = {
  name: 'UnknownTool — generic fallback',
  render: () => <AiToolProgress toolName="some_unknown_tool" toolArgs={{}} />,
};

export const AllTools: Story = {
  name: 'AllTools — all tool types',
  render: () => (
    <div className="space-y-2">
      <AiToolProgress toolName="query_trend" toolArgs={{ series: [{ event_name: '$pageview' }], granularity: 'day', date_from: '2026-01-28', date_to: '2026-02-27' }} />
      <AiToolProgress toolName="query_funnel" toolArgs={{ steps: [{}, {}, {}], date_from: '2026-01-28', date_to: '2026-02-27' }} />
      <AiToolProgress toolName="query_retention" toolArgs={{ target_event: '$pageview', granularity: 'week', date_from: '2026-01-28', date_to: '2026-02-27' }} />
      <AiToolProgress toolName="query_lifecycle" toolArgs={{ target_event: 'feature_used', granularity: 'day', date_from: '2026-01-28', date_to: '2026-02-27' }} />
      <AiToolProgress toolName="query_stickiness" toolArgs={{ target_event: 'dashboard_viewed', granularity: 'week', date_from: '2026-01-28', date_to: '2026-02-27' }} />
      <AiToolProgress toolName="query_paths" toolArgs={{ start_event: '$pageview', end_event: 'signup', date_from: '2026-01-28', date_to: '2026-02-27' }} />
      <AiToolProgress toolName="list_event_names" toolArgs={{}} />
      <AiToolProgress toolName="create_insight" toolArgs={{}} />
      <AiToolProgress toolName="save_to_dashboard" toolArgs={{}} />
    </div>
  ),
};
