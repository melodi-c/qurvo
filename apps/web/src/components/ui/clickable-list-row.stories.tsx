import type { Meta, StoryObj } from '@storybook/react';
import { BarChart2, GitMerge, Users } from 'lucide-react';
import { ClickableListRow } from './clickable-list-row';

const meta: Meta<typeof ClickableListRow> = {
  title: 'UI/ClickableListRow',
  component: ClickableListRow,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ClickableListRow>;

export const Default: Story = {
  args: {
    icon: BarChart2,
    title: 'Weekly Active Users',
    subtitle: 'Updated 2 hours ago',
    onClick: () => {},
  },
};

export const WithDelete: Story = {
  args: {
    icon: BarChart2,
    title: 'Weekly Active Users',
    subtitle: 'Updated 2 hours ago',
    onClick: () => {},
    onDelete: () => {},
  },
};

export const WithRenameAndDelete: Story = {
  args: {
    icon: GitMerge,
    title: 'Activation Funnel',
    subtitle: 'Last run: yesterday',
    onClick: () => {},
    onRename: () => {},
    onDelete: () => {},
  },
};

export const List: Story = {
  render: () => (
    <div className="flex flex-col gap-2 max-w-lg">
      <ClickableListRow
        icon={BarChart2}
        title="Weekly Active Users"
        subtitle="Updated 2 hours ago"
        onClick={() => {}}
        onDelete={() => {}}
      />
      <ClickableListRow
        icon={GitMerge}
        title="Activation Funnel"
        subtitle="Last run: yesterday"
        onClick={() => {}}
        onDelete={() => {}}
      />
      <ClickableListRow
        icon={Users}
        title="Power Users Cohort"
        subtitle="342 members"
        onClick={() => {}}
      />
    </div>
  ),
};
