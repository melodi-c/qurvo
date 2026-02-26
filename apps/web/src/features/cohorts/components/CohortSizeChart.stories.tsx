import type { Meta, StoryObj } from '@storybook/react';
import { CohortSizeChart } from './CohortSizeChart';
import type { CohortHistoryPoint } from '@/api/generated/Api';
import { Skeleton } from '@/components/ui/skeleton';

const meta: Meta = {
  title: 'Cohorts/CohortSizeChart',
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj;

function makeDailyPoints(days: number): CohortHistoryPoint[] {
  const points: CohortHistoryPoint[] = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    points.push({
      date: d.toISOString().slice(0, 10),
      count: 200 + Math.round(Math.sin(i * 0.35) * 50 + (days - i) * 3 + Math.random() * 30),
    });
  }
  return points;
}

const growingData = makeDailyPoints(30);

const stableData: CohortHistoryPoint[] = Array.from({ length: 14 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - (13 - i));
  return { date: d.toISOString().slice(0, 10), count: 450 + Math.round((Math.random() - 0.5) * 20) };
});

export const WithData: Story = {
  name: 'WithData — 30 days growth',
  render: () => (
    <div className="max-w-2xl">
      <CohortSizeChart data={growingData} />
    </div>
  ),
};

export const Stable: Story = {
  name: 'Stable — 14 days flat',
  render: () => (
    <div className="max-w-2xl">
      <CohortSizeChart data={stableData} />
    </div>
  ),
};

export const Empty: Story = {
  name: 'Empty — no data',
  render: () => (
    <div className="max-w-2xl">
      <CohortSizeChart data={[]} />
    </div>
  ),
};

export const Loading: Story = {
  name: 'Loading — skeleton',
  render: () => (
    <div className="max-w-2xl">
      <Skeleton className="h-[280px] w-full rounded-lg" />
    </div>
  ),
};

export const SinglePoint: Story = {
  name: 'SinglePoint — one data point',
  render: () => (
    <div className="max-w-2xl">
      <CohortSizeChart
        data={[{ date: new Date().toISOString().slice(0, 10), count: 42 }]}
      />
    </div>
  ),
};
