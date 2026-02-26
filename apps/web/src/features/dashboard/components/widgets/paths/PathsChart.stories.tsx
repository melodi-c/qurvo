import type { Meta, StoryObj } from '@storybook/react';
import {
  FEW_TRANSITIONS,
  FEW_TOP_PATHS,
  MANY_TRANSITIONS,
  MANY_TOP_PATHS,
} from '@/stories/mocks/paths.mock';
import { PathsChart } from './PathsChart';

const meta: Meta<typeof PathsChart> = {
  title: 'Dashboard/PathsChart',
  component: PathsChart,
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof PathsChart>;

export const FewNodes: Story = {
  args: {
    transitions: FEW_TRANSITIONS,
    topPaths: [],
  },
  render: (args) => (
    <div className="h-[500px] w-full border border-border rounded-lg p-4">
      <PathsChart {...args} />
    </div>
  ),
};

export const ManyNodes: Story = {
  args: {
    transitions: MANY_TRANSITIONS,
    topPaths: [],
  },
  render: (args) => (
    <div className="h-[600px] w-full border border-border rounded-lg p-4">
      <PathsChart {...args} />
    </div>
  ),
};

export const WithTopPathsTable: Story = {
  args: {
    transitions: FEW_TRANSITIONS,
    topPaths: FEW_TOP_PATHS,
  },
  render: (args) => (
    <div className="w-full border border-border rounded-lg p-4">
      <PathsChart {...args} />
    </div>
  ),
};

export const WithTopPathsTableManyNodes: Story = {
  name: 'WithTopPathsTable (many nodes)',
  args: {
    transitions: MANY_TRANSITIONS,
    topPaths: MANY_TOP_PATHS,
  },
  render: (args) => (
    <div className="w-full border border-border rounded-lg p-4">
      <PathsChart {...args} />
    </div>
  ),
};

export const CompactMode: Story = {
  args: {
    transitions: FEW_TRANSITIONS,
    topPaths: FEW_TOP_PATHS,
    compact: true,
  },
  render: (args) => (
    <div className="h-[300px] w-full border border-border rounded-lg p-4">
      <PathsChart {...args} />
    </div>
  ),
};

export const NoData: Story = {
  args: {
    transitions: [],
    topPaths: [],
  },
  render: (args) => (
    <div className="h-[300px] w-full border border-border rounded-lg p-4">
      <PathsChart {...args} />
    </div>
  ),
};
