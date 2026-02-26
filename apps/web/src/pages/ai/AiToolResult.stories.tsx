import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AiToolResult } from './ai-tool-result';
import {
  TREND_MULTI_SERIES,
  TREND_SERIES_14D,
  FIVE_STEPS,
  RETENTION_WEEK_RESULT_WITH_COHORTS,
  LIFECYCLE_BASE,
  STICKINESS_WEEKLY_4,
  MANY_TRANSITIONS,
  MANY_TOP_PATHS,
} from '@/stories/mocks';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

const meta: Meta = {
  title: 'AI/AiToolResult',
  parameters: {
    layout: 'padded',
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <div className="max-w-2xl">
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj;

// ---------------------------------------------------------------------------
// Trend result
// ---------------------------------------------------------------------------

export const TrendResult: Story = {
  name: 'TrendResult — line chart with 2 series',
  render: () => (
    <AiToolResult
      toolName="query_trend"
      visualizationType="trend_chart"
      result={{ series: TREND_MULTI_SERIES, granularity: 'day' }}
    />
  ),
};

export const TrendResultSingleSeries: Story = {
  name: 'TrendResult — single series',
  render: () => (
    <AiToolResult
      toolName="query_trend"
      visualizationType="trend_chart"
      result={{ series: TREND_SERIES_14D, granularity: 'day' }}
    />
  ),
};

// ---------------------------------------------------------------------------
// Funnel result
// ---------------------------------------------------------------------------

export const FunnelResult: Story = {
  name: 'FunnelResult — 5-step funnel',
  render: () => (
    <AiToolResult
      toolName="query_funnel"
      visualizationType="funnel_chart"
      result={{ steps: FIVE_STEPS }}
    />
  ),
};

// ---------------------------------------------------------------------------
// Retention result
// ---------------------------------------------------------------------------

export const RetentionResultStory: Story = {
  name: 'RetentionResult — weekly cohorts',
  render: () => (
    <AiToolResult
      toolName="query_retention"
      visualizationType="retention_chart"
      result={RETENTION_WEEK_RESULT_WITH_COHORTS}
    />
  ),
};

// ---------------------------------------------------------------------------
// Lifecycle result
// ---------------------------------------------------------------------------

export const LifecycleResultStory: Story = {
  name: 'LifecycleResult — daily breakdown',
  render: () => (
    <AiToolResult
      toolName="query_lifecycle"
      visualizationType="lifecycle_chart"
      result={LIFECYCLE_BASE}
    />
  ),
};

// ---------------------------------------------------------------------------
// Stickiness result
// ---------------------------------------------------------------------------

export const StickinessResultStory: Story = {
  name: 'StickinessResult — weekly stickiness',
  render: () => (
    <AiToolResult
      toolName="query_stickiness"
      visualizationType="stickiness_chart"
      result={STICKINESS_WEEKLY_4}
    />
  ),
};

// ---------------------------------------------------------------------------
// Paths result
// ---------------------------------------------------------------------------

export const PathsResult: Story = {
  name: 'PathsResult — user flow paths',
  render: () => (
    <AiToolResult
      toolName="query_paths"
      visualizationType="paths_chart"
      result={{ transitions: MANY_TRANSITIONS, top_paths: MANY_TOP_PATHS }}
    />
  ),
};

// ---------------------------------------------------------------------------
// Segment compare result
// ---------------------------------------------------------------------------

const segmentCompareData = {
  event_name: '$pageview',
  metric: 'unique_users' as const,
  date_from: '2026-01-28',
  date_to: '2026-02-27',
  segment_a: {
    name: 'Mobile',
    value: 8200,
    raw_count: 24600,
    unique_users: 8200,
  },
  segment_b: {
    name: 'Desktop',
    value: 12400,
    raw_count: 37200,
    unique_users: 12400,
  },
  comparison: {
    absolute_diff: -4200,
    relative_diff_pct: -33.9,
    winner: 'Desktop',
  },
};

export const SegmentCompareResult: Story = {
  name: 'SegmentCompareResult — mobile vs desktop',
  render: () => (
    <AiToolResult
      toolName="query_segment_compare"
      visualizationType="segment_compare_chart"
      result={segmentCompareData}
    />
  ),
};

// ---------------------------------------------------------------------------
// Histogram result
// ---------------------------------------------------------------------------

const histogramData = {
  event_a: 'signup_started',
  event_b: 'signup_completed',
  date_from: '2026-01-28',
  date_to: '2026-02-27',
  total_users: 1842,
  buckets: [
    { label: '< 1m', from_seconds: 0, to_seconds: 60, count: 320 },
    { label: '1-5m', from_seconds: 60, to_seconds: 300, count: 580 },
    { label: '5-15m', from_seconds: 300, to_seconds: 900, count: 420 },
    { label: '15-30m', from_seconds: 900, to_seconds: 1800, count: 240 },
    { label: '30m-1h', from_seconds: 1800, to_seconds: 3600, count: 160 },
    { label: '1-2h', from_seconds: 3600, to_seconds: 7200, count: 82 },
    { label: '> 2h', from_seconds: 7200, to_seconds: 86400, count: 40 },
  ],
  stats: {
    mean_seconds: 480,
    median_seconds: 240,
    p75_seconds: 720,
    p90_seconds: 1800,
    min_seconds: 12,
    max_seconds: 14400,
  },
};

export const HistogramResult: Story = {
  name: 'HistogramResult — time between events',
  render: () => (
    <AiToolResult
      toolName="query_histogram"
      visualizationType="histogram_chart"
      result={histogramData}
    />
  ),
};

// ---------------------------------------------------------------------------
// Root cause result
// ---------------------------------------------------------------------------

const rootCauseData = {
  event_name: '$pageview',
  metric: 'unique_users',
  periods: {
    baseline: { from: '2026-01-01', to: '2026-01-27' },
    current: { from: '2026-01-28', to: '2026-02-27' },
  },
  overall: {
    metric: 'unique_users',
    absolute_change: 1240,
    relative_change_pct: 18.5,
  },
  top_segments: [
    {
      dimension: 'device_type',
      segment_value: 'mobile',
      contribution_pct: 42.5,
      relative_change_pct: 28.3,
      absolute_change: 527,
      baseline_value: 1860,
      current_value: 2387,
    },
    {
      dimension: 'country',
      segment_value: 'US',
      contribution_pct: 31.2,
      relative_change_pct: 22.1,
      absolute_change: 387,
      baseline_value: 1750,
      current_value: 2137,
    },
    {
      dimension: 'browser',
      segment_value: 'Chrome',
      contribution_pct: 18.8,
      relative_change_pct: 14.5,
      absolute_change: 233,
      baseline_value: 1608,
      current_value: 1841,
    },
    {
      dimension: 'country',
      segment_value: 'DE',
      contribution_pct: -12.3,
      relative_change_pct: -9.8,
      absolute_change: -153,
      baseline_value: 1561,
      current_value: 1408,
    },
  ],
};

export const RootCauseResult: Story = {
  name: 'RootCauseResult — metric change breakdown',
  render: () => (
    <AiToolResult
      toolName="query_root_cause"
      visualizationType="root_cause_chart"
      result={rootCauseData}
    />
  ),
};

// ---------------------------------------------------------------------------
// Funnel gap result
// ---------------------------------------------------------------------------

const funnelGapData = {
  funnel_step_from: 'pricing_viewed',
  funnel_step_to: 'signup_completed',
  items: [
    {
      event_name: 'feature_comparison_viewed',
      relative_lift_pct: 85.4,
      users_with_event: 620,
      users_without_event: 1820,
    },
    {
      event_name: 'faq_clicked',
      relative_lift_pct: 62.1,
      users_with_event: 380,
      users_without_event: 2060,
    },
    {
      event_name: 'demo_requested',
      relative_lift_pct: 120.3,
      users_with_event: 240,
      users_without_event: 2200,
    },
    {
      event_name: 'chat_opened',
      relative_lift_pct: -15.2,
      users_with_event: 180,
      users_without_event: 2260,
    },
  ],
};

export const FunnelGapResult: Story = {
  name: 'FunnelGapResult — events correlating with conversion',
  render: () => (
    <AiToolResult
      toolName="query_funnel_gap"
      visualizationType="funnel_gap_chart"
      result={funnelGapData}
    />
  ),
};

// ---------------------------------------------------------------------------
// Link result (create_insight / save_to_dashboard)
// ---------------------------------------------------------------------------

export const LinkResultCreateInsight: Story = {
  name: 'LinkResult — create_insight',
  render: () => (
    <AiToolResult
      toolName="create_insight"
      visualizationType={null}
      result={{ link: '/projects/demo/insights/trend/ins-123', name: 'Daily Active Users' }}
    />
  ),
};

export const LinkResultSaveDashboard: Story = {
  name: 'LinkResult — save_to_dashboard',
  render: () => (
    <AiToolResult
      toolName="save_to_dashboard"
      visualizationType={null}
      result={{ link: '/projects/demo/dashboards/dash-456', dashboard_id: 'dash-456' }}
    />
  ),
};

// ---------------------------------------------------------------------------
// No result / unknown
// ---------------------------------------------------------------------------

export const NoResult: Story = {
  name: 'NoResult — null result',
  render: () => (
    <AiToolResult
      toolName="list_event_names"
      visualizationType={null}
      result={null}
    />
  ),
};

// ---------------------------------------------------------------------------
// All chart types side by side
// ---------------------------------------------------------------------------

export const AllChartTypes: Story = {
  name: 'AllChartTypes — overview',
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <div className="max-w-3xl space-y-6">
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
  render: () => (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-muted-foreground font-mono mb-2">trend_chart</p>
        <AiToolResult toolName="query_trend" visualizationType="trend_chart" result={{ series: TREND_MULTI_SERIES, granularity: 'day' }} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground font-mono mb-2">funnel_chart</p>
        <AiToolResult toolName="query_funnel" visualizationType="funnel_chart" result={{ steps: FIVE_STEPS }} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground font-mono mb-2">retention_chart</p>
        <AiToolResult toolName="query_retention" visualizationType="retention_chart" result={RETENTION_WEEK_RESULT_WITH_COHORTS} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground font-mono mb-2">lifecycle_chart</p>
        <AiToolResult toolName="query_lifecycle" visualizationType="lifecycle_chart" result={LIFECYCLE_BASE} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground font-mono mb-2">stickiness_chart</p>
        <AiToolResult toolName="query_stickiness" visualizationType="stickiness_chart" result={STICKINESS_WEEKLY_4} />
      </div>
    </div>
  ),
};
