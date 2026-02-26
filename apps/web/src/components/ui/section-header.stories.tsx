import type { Meta, StoryObj } from '@storybook/react';
import {
  Calendar,
  Filter,
  GitMerge,
  MousePointerClick,
  Settings,
  Users,
  BarChart2,
  Layers,
} from 'lucide-react';
import { SectionHeader } from './section-header';

const meta: Meta<typeof SectionHeader> = {
  title: 'UI/SectionHeader',
  component: SectionHeader,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof SectionHeader>;

export const AllIcons: Story = {
  render: () => (
    <div className="flex flex-col gap-6 p-4 max-w-xs">
      <SectionHeader icon={Calendar} label="Date Range" />
      <SectionHeader icon={Filter} label="Filters" />
      <SectionHeader icon={Users} label="Cohorts" />
      <SectionHeader icon={GitMerge} label="Steps" />
      <SectionHeader icon={MousePointerClick} label="Events" />
      <SectionHeader icon={Settings} label="Display" />
      <SectionHeader icon={BarChart2} label="Breakdown" />
      <SectionHeader icon={Layers} label="Series" />
    </div>
  ),
};

export const Single: Story = {
  args: {
    icon: Filter,
    label: 'Filters',
  },
};

export const InContext: Story = {
  render: () => (
    <div className="flex flex-col gap-4 p-4 max-w-xs border border-border rounded-lg">
      <SectionHeader icon={Calendar} label="Date Range" />
      <div className="h-8 bg-muted rounded" />
      <div className="h-px bg-border" />
      <SectionHeader icon={Filter} label="Filters" />
      <div className="h-8 bg-muted rounded" />
      <div className="h-px bg-border" />
      <SectionHeader icon={Users} label="Cohorts" />
      <div className="h-8 bg-muted rounded" />
    </div>
  ),
};
