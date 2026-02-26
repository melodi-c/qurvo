import type { Meta, StoryObj } from '@storybook/react';
import { Skeleton } from './skeleton';
import { EditorSkeleton } from './editor-skeleton';

const meta: Meta<typeof EditorSkeleton> = {
  title: 'UI/EditorSkeleton',
  component: EditorSkeleton,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof EditorSkeleton>;

export const OneMetric: Story = {
  render: () => (
    <div className="p-6">
      <EditorSkeleton metricCount={1} />
    </div>
  ),
};

export const TwoMetrics: Story = {
  render: () => (
    <div className="p-6">
      <EditorSkeleton metricCount={2} />
    </div>
  ),
};

export const ThreeMetrics: Story = {
  render: () => (
    <div className="p-6">
      <EditorSkeleton metricCount={3} />
    </div>
  ),
};

export const WithCustomChildren: Story = {
  render: () => (
    <div className="p-6">
      <EditorSkeleton metricCount={2}>
        <div className="flex gap-4 mt-2">
          <Skeleton className="h-[200px] flex-1" />
          <Skeleton className="h-[200px] flex-1" />
        </div>
      </EditorSkeleton>
    </div>
  ),
};

export const FunnelShape: Story = {
  render: () => (
    <div className="p-6">
      <EditorSkeleton metricCount={2}>
        <div className="space-y-2 mt-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-4/5" />
          <Skeleton className="h-16 w-3/5" />
          <Skeleton className="h-16 w-2/5" />
        </div>
      </EditorSkeleton>
    </div>
  ),
};
