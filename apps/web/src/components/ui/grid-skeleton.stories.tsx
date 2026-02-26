import type { Meta, StoryObj } from '@storybook/react';
import { GridSkeleton } from './grid-skeleton';

const meta: Meta<typeof GridSkeleton> = {
  title: 'UI/GridSkeleton',
  component: GridSkeleton,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof GridSkeleton>;

export const ThreeItems: Story = {
  render: () => <GridSkeleton count={3} />,
};

export const SixItems: Story = {
  render: () => <GridSkeleton count={6} />,
};

export const TallCards: Story = {
  render: () => <GridSkeleton count={3} height="h-48" />,
};

export const SingleItem: Story = {
  render: () => <GridSkeleton count={1} />,
};
