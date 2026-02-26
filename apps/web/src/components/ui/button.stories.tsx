import type { Meta, StoryObj } from '@storybook/react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { Button } from './button';

const meta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'],
    },
    size: {
      control: 'select',
      options: ['default', 'xs', 'sm', 'lg', 'icon', 'icon-xs', 'icon-sm', 'icon-lg'],
    },
    disabled: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Default: Story = {
  args: {
    children: 'Button',
    variant: 'default',
    size: 'default',
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <Button variant="default">Default</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="link">Link</Button>
    </div>
  ),
};

export const AllSizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="xs">Extra Small</Button>
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
    </div>
  ),
};

export const IconButtons: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="icon-xs" variant="ghost"><Plus /></Button>
      <Button size="icon-sm" variant="ghost"><Save /></Button>
      <Button size="icon" variant="ghost"><Trash2 /></Button>
      <Button size="icon-lg" variant="ghost"><Plus /></Button>
    </div>
  ),
};

export const WithIcon: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <Button><Save className="h-3.5 w-3.5" />Save</Button>
      <Button variant="destructive"><Trash2 className="h-3.5 w-3.5" />Delete</Button>
      <Button variant="outline"><Plus className="h-3.5 w-3.5" />Add New</Button>
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <Button disabled>Default Disabled</Button>
      <Button variant="destructive" disabled>Destructive Disabled</Button>
      <Button variant="outline" disabled>Outline Disabled</Button>
    </div>
  ),
};

export const Loading: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <Button disabled>
        <Save className="h-3.5 w-3.5 animate-spin" />
        Saving...
      </Button>
    </div>
  ),
};
