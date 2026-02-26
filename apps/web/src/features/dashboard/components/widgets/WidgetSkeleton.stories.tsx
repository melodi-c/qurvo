import type { Meta, StoryObj } from '@storybook/react';
import { WidgetSkeleton } from './WidgetSkeleton';

const meta: Meta<typeof WidgetSkeleton> = {
  title: 'Dashboard/WidgetSkeleton',
  component: WidgetSkeleton,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof WidgetSkeleton>;

export const Chart: Story = {
  args: { variant: 'chart' },
  decorators: [
    (Story) => (
      <div className="w-[400px] h-[240px] border border-border rounded-xl overflow-hidden bg-card">
        <Story />
      </div>
    ),
  ],
};

export const Table: Story = {
  args: { variant: 'table' },
  decorators: [
    (Story) => (
      <div className="w-[400px] h-[240px] border border-border rounded-xl overflow-hidden bg-card">
        <Story />
      </div>
    ),
  ],
};

export const Flow: Story = {
  args: { variant: 'flow' },
  decorators: [
    (Story) => (
      <div className="w-[400px] h-[240px] border border-border rounded-xl overflow-hidden bg-card">
        <Story />
      </div>
    ),
  ],
};

export const AllVariants: Story = {
  name: 'AllVariants — chart / table / flow side by side',
  render: () => (
    <div className="flex gap-4 flex-wrap">
      {(['chart', 'table', 'flow'] as const).map((variant) => (
        <div
          key={variant}
          className="w-[360px] h-[220px] border border-border rounded-xl overflow-hidden bg-card flex flex-col"
        >
          <div className="px-3 pt-2 pb-1 text-xs text-muted-foreground font-mono border-b border-border">
            {variant}
          </div>
          <div className="flex-1 min-h-0">
            <WidgetSkeleton variant={variant} />
          </div>
        </div>
      ))}
    </div>
  ),
};
