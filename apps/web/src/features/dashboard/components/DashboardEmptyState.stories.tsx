import type { Meta, StoryObj } from '@storybook/react';
import { DashboardEmptyState } from './DashboardEmptyState';

const meta: Meta<typeof DashboardEmptyState> = {
  title: 'Dashboard/DashboardEmptyState',
  component: DashboardEmptyState,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof DashboardEmptyState>;

export const Default: Story = {
  name: 'Default — view mode empty',
  args: {
    isEditing: false,
    onAddInsight: () => {},
    onAddText: () => {},
  },
};

export const EditMode: Story = {
  name: 'EditMode — editing with add buttons',
  args: {
    isEditing: true,
    onAddInsight: () => {},
    onAddText: () => {},
  },
};
