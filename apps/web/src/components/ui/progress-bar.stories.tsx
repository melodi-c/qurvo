import type { Meta, StoryObj } from '@storybook/react';
import { ProgressBar } from './progress-bar';

const meta: Meta<typeof ProgressBar> = {
  title: 'UI/ProgressBar',
  component: ProgressBar,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
  decorators: [
    (Story) => (
      <div className="w-64">
        <div className="relative flex items-center gap-2 rounded-md px-2 py-1.5 text-sm">
          <Story />
          <span className="relative min-w-0 flex-1 truncate">Row label</span>
          <span className="relative w-16 text-right tabular-nums text-foreground/70">1,234</span>
        </div>
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ProgressBar>;

export const Default: Story = {
  args: {
    value: 600,
    max: 1000,
  },
};

export const Full: Story = {
  args: {
    value: 1000,
    max: 1000,
  },
};

export const Empty: Story = {
  args: {
    value: 0,
    max: 1000,
  },
};

export const Small: Story = {
  args: {
    value: 50,
    max: 1000,
  },
};

export const TableRows: StoryObj = {
  render: () => {
    const rows = [
      { name: '/home', visitors: 4200 },
      { name: '/pricing', visitors: 2800 },
      { name: '/docs/quickstart', visitors: 1900 },
      { name: '/blog/analytics-guide', visitors: 1400 },
      { name: '/login', visitors: 980 },
    ];
    const max = Math.max(...rows.map((r) => r.visitors));
    return (
      <div className="w-80 space-y-1">
        {rows.map((row) => (
          <div key={row.name} className="relative flex items-center gap-2 rounded-md px-2 py-1.5 text-sm">
            <ProgressBar value={row.visitors} max={max} />
            <span className="relative min-w-0 flex-1 truncate text-foreground/80">{row.name}</span>
            <span className="relative w-20 text-right tabular-nums text-foreground/70">
              {row.visitors.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    );
  },
};
