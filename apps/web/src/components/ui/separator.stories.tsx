import type { Meta, StoryObj } from '@storybook/react';
import { Separator } from './separator';

const meta: Meta<typeof Separator> = {
  title: 'UI/Separator',
  component: Separator,
  tags: ['autodocs'],
  argTypes: {
    orientation: {
      control: 'select',
      options: ['horizontal', 'vertical'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Separator>;

export const Horizontal: Story = {
  render: () => (
    <div className="w-72">
      <div className="space-y-1">
        <p className="text-sm font-medium">Section A</p>
        <p className="text-sm text-muted-foreground">Content above the separator</p>
      </div>
      <Separator className="my-4" />
      <div className="space-y-1">
        <p className="text-sm font-medium">Section B</p>
        <p className="text-sm text-muted-foreground">Content below the separator</p>
      </div>
    </div>
  ),
};

export const Vertical: Story = {
  render: () => (
    <div className="flex items-center h-8 gap-2">
      <span className="text-sm">Events</span>
      <Separator orientation="vertical" />
      <span className="text-sm">Persons</span>
      <Separator orientation="vertical" />
      <span className="text-sm">Sessions</span>
    </div>
  ),
};

export const InQueryPanel: Story = {
  render: () => (
    <div className="w-72 flex flex-col gap-4 p-4 border rounded-md">
      <div>
        <p className="text-xs uppercase font-medium text-muted-foreground">Date Range</p>
        <p className="text-sm mt-1">Last 30 days</p>
      </div>
      <Separator />
      <div>
        <p className="text-xs uppercase font-medium text-muted-foreground">Event</p>
        <p className="text-sm mt-1">$pageview</p>
      </div>
      <Separator />
      <div>
        <p className="text-xs uppercase font-medium text-muted-foreground">Breakdown</p>
        <p className="text-sm mt-1 text-muted-foreground">None</p>
      </div>
    </div>
  ),
};
