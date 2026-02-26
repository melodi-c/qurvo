import type { Meta, StoryObj } from '@storybook/react';
import { Plus, Settings } from 'lucide-react';
import { Button } from './button';
import { PageHeader } from './page-header';

const meta: Meta<typeof PageHeader> = {
  title: 'UI/PageHeader',
  component: PageHeader,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof PageHeader>;

export const WithTitle: Story = {
  render: () => (
    <div className="p-6">
      <PageHeader title="Projects" />
    </div>
  ),
};

export const WithActionButton: Story = {
  render: () => (
    <div className="p-6">
      <PageHeader title="Trends">
        <Button size="sm">
          <Plus className="h-3.5 w-3.5" />
          New Trend
        </Button>
      </PageHeader>
    </div>
  ),
};

export const WithMultipleActions: Story = {
  render: () => (
    <div className="p-6">
      <PageHeader title="Settings">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline">
            <Settings className="h-3.5 w-3.5" />
            Configure
          </Button>
          <Button size="sm">
            <Plus className="h-3.5 w-3.5" />
            Add Member
          </Button>
        </div>
      </PageHeader>
    </div>
  ),
};

export const LongTitle: Story = {
  render: () => (
    <div className="max-w-sm p-6">
      <PageHeader title="A very long page title that might get truncated on smaller screens">
        <Button size="sm">Action</Button>
      </PageHeader>
    </div>
  ),
};
