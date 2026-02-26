import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AiToolResult } from './ai-tool-result';
import type {
  RetentionResult as RetentionResultType,
  LifecycleResult as LifecycleResultType,
  StickinessResult as StickinessResultType,
  PathTransition,
  TopPath,
  TrendSeriesResult,
  FunnelStepResult,
} from '@/api/generated/Api';

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
// Helpers
// ---------------------------------------------------------------------------

function makeDailyBuckets(days: number): string[] {
  const buckets: string[] = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    buckets.push(d.toISOString().slice(0, 10));
  }
  return buckets;
}

const buckets14 = makeDailyBuckets(14);
const buckets30 = makeDailyBuckets(30);

// ---------------------------------------------------------------------------
// Trend result
// ---------------------------------------------------------------------------

const trendSeries: TrendSeriesResult[] = [
  {
    series_idx: 0,
    label: '$pageview',
    event_name: '$pageview',
    data: buckets30.map((bucket, i) => ({
      bucket,
      value: 800 + Math.round(Math.sin(i * 0.4) * 200 + i * 5),
    })),
  },
  {
    series_idx: 1,
    label: 'signup',
    event_name: 'signup',
    data: buckets30.map((bucket, i) => ({
      bucket,
      value: 80 + Math.round(Math.sin(i * 0.35) * 20 + i * 0.5),
    })),
  },
];

export const TrendResult: Story = {
  name: 'TrendResult — line chart with 2 series',
  render: () => (
    <AiToolResult
      toolName="query_trend"
      visualizationType="trend_chart"
      result={{ series: trendSeries, granularity: 'day' }}
    />
  ),
};

export const TrendResultSingleSeries: Story = {
  name: 'TrendResult — single series',
  render: () => (
    <AiToolResult
      toolName="query_trend"
      visualizationType="trend_chart"
      result={{ series: [trendSeries[0]], granularity: 'day' }}
    />
  ),
};

// ---------------------------------------------------------------------------
// Funnel result
// ---------------------------------------------------------------------------

const funnelSteps: FunnelStepResult[] = [
  {
    step: 1,
    label: 'Step 1',
    event_name: '$pageview',
    count: 10000,
    conversion_rate: 1.0,
    drop_off: 0,
    drop_off_rate: 0,
    avg_time_to_convert_seconds: null,
  },
  {
    step: 2,
    label: 'Step 2',
    event_name: 'signup_started',
    count: 3200,
    conversion_rate: 0.32,
    drop_off: 6800,
    drop_off_rate: 0.68,
    avg_time_to_convert_seconds: 45,
  },
  {
    step: 3,
    label: 'Step 3',
    event_name: 'signup_completed',
    count: 1800,
    conversion_rate: 0.5625,
    drop_off: 1400,
    drop_off_rate: 0.4375,
    avg_time_to_convert_seconds: 120,
  },
  {
    step: 4,
    label: 'Step 4',
    event_name: 'onboarding_done',
    count: 1200,
    conversion_rate: 0.6667,
    drop_off: 600,
    drop_off_rate: 0.3333,
    avg_time_to_convert_seconds: 300,
  },
];

export const FunnelResult: Story = {
  name: 'FunnelResult — 4-step funnel',
  render: () => (
    <AiToolResult
      toolName="query_funnel"
      visualizationType="funnel_chart"
      result={{ steps: funnelSteps }}
    />
  ),
};

// ---------------------------------------------------------------------------
// Retention result
// ---------------------------------------------------------------------------

const retentionData: RetentionResultType = {
  retention_type: 'first_time',
  granularity: 'week',
  cohorts: buckets14.slice(0, 6).map((date, i) => ({
    cohort_date: date,
    cohort_size: 200 - i * 20,
    periods: [
      1.0,
      0.7 - i * 0.05,
      0.5 - i * 0.04,
      0.4 - i * 0.03,
      0.35 - i * 0.02,
      0.3 - i * 0.01,
    ].slice(0, 6 - i).map((v) => Math.max(0, v)),
  })),
  average_retention: [1.0, 0.65, 0.48, 0.38, 0.32, 0.28],
};

export const RetentionResultStory: Story = {
  name: 'RetentionResult — weekly cohorts',
  render: () => (
    <AiToolResult
      toolName="query_retention"
      visualizationType="retention_chart"
      result={retentionData}
    />
  ),
};

// ---------------------------------------------------------------------------
// Lifecycle result
// ---------------------------------------------------------------------------

const lifecycleData: LifecycleResultType = {
  granularity: 'day',
  data: buckets14.map((bucket, i) => ({
    bucket,
    new: 50 + Math.round(Math.sin(i * 0.5) * 15),
    returning: 180 + Math.round(Math.cos(i * 0.4) * 30),
    resurrecting: 20 + Math.round(Math.sin(i * 0.3) * 8),
    dormant: -(80 + Math.round(Math.cos(i * 0.45) * 20)),
  })),
  totals: { new: 720, returning: 2520, resurrecting: 280, dormant: -1120 },
};

export const LifecycleResultStory: Story = {
  name: 'LifecycleResult — daily breakdown',
  render: () => (
    <AiToolResult
      toolName="query_lifecycle"
      visualizationType="lifecycle_chart"
      result={lifecycleData}
    />
  ),
};

// ---------------------------------------------------------------------------
// Stickiness result
// ---------------------------------------------------------------------------

const stickinessData: StickinessResultType = {
  granularity: 'week',
  total_periods: 4,
  data: [
    { period_count: 1, user_count: 420 },
    { period_count: 2, user_count: 280 },
    { period_count: 3, user_count: 160 },
    { period_count: 4, user_count: 95 },
  ],
};

export const StickinessResultStory: Story = {
  name: 'StickinessResult — weekly stickiness',
  render: () => (
    <AiToolResult
      toolName="query_stickiness"
      visualizationType="stickiness_chart"
      result={stickinessData}
    />
  ),
};

// ---------------------------------------------------------------------------
// Paths result
// ---------------------------------------------------------------------------

const pathTransitions: PathTransition[] = [
  { step: 1, source: '$pageview', target: 'pricing_viewed', person_count: 2400 },
  { step: 1, source: '$pageview', target: 'signup_started', person_count: 1800 },
  { step: 1, source: '$pageview', target: 'docs_viewed', person_count: 1200 },
  { step: 2, source: 'pricing_viewed', target: 'signup_started', person_count: 960 },
  { step: 2, source: 'pricing_viewed', target: '$pageview', person_count: 480 },
  { step: 2, source: 'signup_started', target: 'signup_completed', person_count: 1440 },
  { step: 2, source: 'signup_started', target: '$pageview', person_count: 360 },
  { step: 3, source: 'signup_started', target: 'onboarding_done', person_count: 1080 },
  { step: 3, source: 'signup_completed', target: 'onboarding_started', person_count: 1200 },
];

const topPaths: TopPath[] = [
  { path: ['$pageview', 'signup_started', 'signup_completed'], person_count: 1440 },
  { path: ['$pageview', 'pricing_viewed', 'signup_started'], person_count: 960 },
];

export const PathsResult: Story = {
  name: 'PathsResult — user flow paths',
  render: () => (
    <AiToolResult
      toolName="query_paths"
      visualizationType="paths_chart"
      result={{ transitions: pathTransitions, top_paths: topPaths }}
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
        <AiToolResult toolName="query_trend" visualizationType="trend_chart" result={{ series: trendSeries, granularity: 'day' }} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground font-mono mb-2">funnel_chart</p>
        <AiToolResult toolName="query_funnel" visualizationType="funnel_chart" result={{ steps: funnelSteps }} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground font-mono mb-2">retention_chart</p>
        <AiToolResult toolName="query_retention" visualizationType="retention_chart" result={retentionData} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground font-mono mb-2">lifecycle_chart</p>
        <AiToolResult toolName="query_lifecycle" visualizationType="lifecycle_chart" result={lifecycleData} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground font-mono mb-2">stickiness_chart</p>
        <AiToolResult toolName="query_stickiness" visualizationType="stickiness_chart" result={stickinessData} />
      </div>
    </div>
  ),
};
