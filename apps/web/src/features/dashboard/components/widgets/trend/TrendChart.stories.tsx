import type { Meta, StoryObj } from '@storybook/react';
import type { TrendFormula, Annotation } from '@/api/generated/Api';
import {
  BUCKETS_14,
  TREND_SERIES_14D,
  TREND_MULTI_SERIES,
  TREND_BAR_SERIES,
  TREND_COMPACT_SERIES,
  TREND_COMPARE_CURRENT,
  TREND_COMPARE_PREVIOUS,
  TREND_FORMULA_SERIES,
  TREND_INCOMPLETE_SERIES,
} from '@/stories/mocks/trend.mock';
import { TrendChart } from './TrendChart';

const formulas: TrendFormula[] = [
  { id: 'f1', label: 'Conversion %', expression: 'A / B * 100' },
];

const meta: Meta<typeof TrendChart> = {
  title: 'Dashboard/TrendChart',
  component: TrendChart,
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof TrendChart>;

export const SingleLine: Story = {
  render: () => (
    <div className="w-full">
      <TrendChart
        series={TREND_SERIES_14D}
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
        series={TREND_MULTI_SERIES}
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
        series={TREND_BAR_SERIES}
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
        series={TREND_COMPACT_SERIES}
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
        series={TREND_COMPARE_CURRENT}
        previousSeries={TREND_COMPARE_PREVIOUS}
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
        series={TREND_FORMULA_SERIES}
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
        series={TREND_INCOMPLETE_SERIES}
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
          series={TREND_SERIES_14D}
          chartType="line"
          granularity="day"
          annotations={annotations}
        />
      </div>
    );
  },
};
