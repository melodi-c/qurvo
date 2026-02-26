import type { Meta, StoryObj } from '@storybook/react';
import { BarChart2, GitMerge, Users, Plus } from 'lucide-react';
import { Button } from './button';
import { EmptyState } from './empty-state';

const meta: Meta<typeof EmptyState> = {
  title: 'UI/EmptyState',
  component: EmptyState,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof EmptyState>;

export const Compact: Story = {
  args: {
    icon: BarChart2,
    description: 'No data available for this period.',
  },
};

export const Full: Story = {
  args: {
    icon: BarChart2,
    title: 'No charts yet',
    description: 'Create your first chart to start tracking metrics.',
    action: (
      <Button size="sm">
        <Plus className="h-3.5 w-3.5" />
        New Chart
      </Button>
    ),
  },
};

export const FunnelEmpty: Story = {
  args: {
    icon: GitMerge,
    title: 'No funnels created',
    description: 'Build a funnel to understand your conversion flow.',
    action: <Button size="sm">Create Funnel</Button>,
  },
};

export const UsersEmpty: Story = {
  args: {
    icon: Users,
    description: 'No users matched your filter criteria.',
  },
};

export const NoProject: Story = {
  args: {
    icon: BarChart2,
    title: 'Select a project',
    description: 'Choose a project from the sidebar to get started.',
  },
};
