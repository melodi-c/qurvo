import type { Meta, StoryObj } from '@storybook/react';
import { Badge } from './badge';

const meta: Meta<typeof Badge> = {
  title: 'UI/Badge',
  component: Badge,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'secondary', 'destructive', 'outline', 'ghost', 'link'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Badge>;

export const Default: Story = {
  args: {
    children: 'Badge',
    variant: 'default',
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <Badge variant="default">Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="destructive">Destructive</Badge>
      <Badge variant="outline">Outline</Badge>
      <Badge variant="ghost">Ghost</Badge>
      <Badge variant="link">Link</Badge>
    </div>
  ),
};

export const EventTypes: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge variant="secondary">$pageview</Badge>
      <Badge variant="secondary">$identify</Badge>
      <Badge variant="outline">custom_event</Badge>
      <Badge variant="destructive">error</Badge>
    </div>
  ),
};

export const LongText: Story = {
  args: {
    children: 'A very long badge label that might overflow',
    variant: 'secondary',
  },
};
