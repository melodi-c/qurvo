import type { Meta, StoryObj } from '@storybook/react';
import type { TrendSeriesResult, TrendFormula, Annotation } from '@/api/generated/Api';
import { TrendChart } from './TrendChart';

// ── Helper to generate realistic data ──

function makeBuckets(count: number, offsetDays = 0): string[] {
  const buckets: string[] = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i - offsetDays);
    buckets.push(d.toISOString().slice(0, 10));
  }
  return buckets;
}

function makeSeries(
  label: string,
  values: number[],
  buckets: string[],
  overrides: Partial<TrendSeriesResult> = {},
): TrendSeriesResult {
  return {
    series_idx: 0,
    label,
    event_name: '$pageview',
    data: buckets.map((bucket, i) => ({ bucket, value: values[i] ?? 0 })),
    ...overrides,
  };
}

const BUCKETS_14 = makeBuckets(14);

// ── 1. SingleLine — one series, line mode ──

const singleSeries: TrendSeriesResult[] = [
  makeSeries('Pageviews', [120, 145, 132, 167, 198, 154, 143, 187, 210, 176, 189, 224, 211, 198], BUCKETS_14),
];

// ── 2. MultiSeries — multiple series with legend ──

const multiSeries: TrendSeriesResult[] = [
  makeSeries('Pageviews', [120, 145, 132, 167, 198, 154, 143, 187, 210, 176, 189, 224, 211, 198], BUCKETS_14, { series_idx: 0 }),
  makeSeries('Sign Ups',  [12,  18,  14,  22,  28,  19,  16,  25,  31,  22,  27,  33,  30,  26], BUCKETS_14, { series_idx: 1 }),
  makeSeries('Purchases', [4,   6,   5,   8,   10,  7,   6,   9,   11,  8,   10,  13,  11,  9],  BUCKETS_14, { series_idx: 2 }),
];

// ── 3. BarMode — bar instead of line ──

const barSeries: TrendSeriesResult[] = [
  makeSeries('Sessions', [85, 102, 98, 120, 145, 110, 95, 130, 155, 122, 138, 160, 148, 135], BUCKETS_14),
];

// ── 4. CompactMode — compact view for dashboard widget ──

const compactSeries: TrendSeriesResult[] = [
  makeSeries('DAU', [340, 380, 420, 395, 460, 510, 490, 530, 515, 480, 545, 590, 575, 560], BUCKETS_14, { series_idx: 0 }),
  makeSeries('WAU', [820, 850, 880, 910, 940, 970, 990, 1010, 1020, 1040, 1060, 1085, 1090, 1100], BUCKETS_14, { series_idx: 1 }),
];

// ── 5. WithComparePeriod — two periods for comparison ──

const compareCurrent: TrendSeriesResult[] = [
  makeSeries('Pageviews', [120, 145, 132, 167, 198, 154, 143, 187, 210, 176, 189, 224, 211, 198], BUCKETS_14),
];

const comparePrevious: TrendSeriesResult[] = [
  makeSeries('Pageviews', [100, 118, 109, 140, 162, 128, 118, 155, 178, 145, 160, 194, 182, 170], BUCKETS_14),
];

// ── 6. WithFormula — formula mode (A / B * 100 = conversion rate) ──

const formulaSeries: TrendSeriesResult[] = [
  makeSeries('Sign Ups',  [12, 18, 14, 22, 28, 19, 16, 25, 31, 22, 27, 33, 30, 26], BUCKETS_14, { series_idx: 0 }),
  makeSeries('Pageviews', [120, 145, 132, 167, 198, 154, 143, 187, 210, 176, 189, 224, 211, 198], BUCKETS_14, { series_idx: 1 }),
];

const formulas: TrendFormula[] = [
  { id: 'f1', label: 'Conversion %', expression: 'A / B * 100' },
];

// ── 7. IncompletePeriod — last bucket is incomplete (today) ──

// Today's bucket is always the last one — TrendChart detects it via isIncompleteBucket
const incompleteCurrentDay = new Date().toISOString().slice(0, 10);
const BUCKETS_WITH_TODAY = [...makeBuckets(13, 1), incompleteCurrentDay];

const incompleteSeries: TrendSeriesResult[] = [
  makeSeries(
    'Events',
    [210, 245, 228, 267, 298, 255, 244, 289, 312, 278, 291, 320, 305, 87], // last value is partial
    BUCKETS_WITH_TODAY,
  ),
];

// ── Meta ──

const meta: Meta<typeof TrendChart> = {
  title: 'Dashboard/TrendChart',
  component: TrendChart,
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof TrendChart>;

// ── Stories ──

export const SingleLine: Story = {
  render: () => (
    <div className="w-full">
      <TrendChart
        series={singleSeries}
        chartType="line"
        granularity="day"
      />
    </div>
  ),
};

export const MultiSeries: Story = {
  render: () => (
    <div className="w-full">
      <TrendChart
        series={multiSeries}
        chartType="line"
        granularity="day"
      />
    </div>
  ),
};

export const BarMode: Story = {
  render: () => (
    <div className="w-full">
      <TrendChart
        series={barSeries}
        chartType="bar"
        granularity="day"
      />
    </div>
  ),
};

export const CompactMode: Story = {
  render: () => (
    <div style={{ width: 320, height: 160, border: '1px solid var(--color-border)', borderRadius: 8, padding: 8 }}>
      <TrendChart
        series={compactSeries}
        chartType="line"
        granularity="day"
        compact
      />
    </div>
  ),
};

export const WithComparePeriod: Story = {
  render: () => (
    <div className="w-full">
      <TrendChart
        series={compareCurrent}
        previousSeries={comparePrevious}
        chartType="line"
        granularity="day"
      />
    </div>
  ),
};

export const WithFormula: Story = {
  render: () => (
    <div className="w-full">
      <TrendChart
        series={formulaSeries}
        chartType="line"
        granularity="day"
        formulas={formulas}
      />
    </div>
  ),
};

export const IncompletePeriod: Story = {
  render: () => (
    <div className="w-full">
      <TrendChart
        series={incompleteSeries}
        chartType="line"
        granularity="day"
      />
    </div>
  ),
};

export const WithAnnotations: Story = {
  render: () => {
    const annotations: Annotation[] = [
      {
        id: 'ann-1',
        project_id: 'proj-1',
        created_by: 'user-1',
        date: BUCKETS_14[4],
        label: 'Marketing Campaign',
        color: 'hsl(200 80% 60%)',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'ann-2',
        project_id: 'proj-1',
        created_by: 'user-1',
        date: BUCKETS_14[9],
        label: 'New Feature Launch',
        color: 'hsl(120 60% 50%)',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    return (
      <div className="w-full">
        <TrendChart
          series={singleSeries}
          chartType="line"
          granularity="day"
          annotations={annotations}
        />
      </div>
    );
  },
};
