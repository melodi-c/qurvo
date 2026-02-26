import type { Meta, StoryObj } from '@storybook/react';
import { ListSkeleton } from './list-skeleton';
import { GridSkeleton } from './grid-skeleton';

const meta: Meta = {
  title: 'UI/Skeletons',
};

export default meta;

export const ListDefault: StoryObj<typeof ListSkeleton> = {
  render: () => <ListSkeleton />,
};

export const ListFewItems: StoryObj<typeof ListSkeleton> = {
  render: () => <ListSkeleton count={2} />,
};

export const ListManyItems: StoryObj<typeof ListSkeleton> = {
  render: () => <ListSkeleton count={6} />,
};

export const ListTallRows: StoryObj<typeof ListSkeleton> = {
  render: () => <ListSkeleton count={3} height="h-24" />,
};

export const GridDefault: StoryObj<typeof GridSkeleton> = {
  render: () => <GridSkeleton />,
};

export const GridTwoItems: StoryObj<typeof GridSkeleton> = {
  render: () => <GridSkeleton count={2} />,
};

export const GridSixItems: StoryObj<typeof GridSkeleton> = {
  render: () => <GridSkeleton count={6} />,
};

export const GridTall: StoryObj<typeof GridSkeleton> = {
  render: () => <GridSkeleton count={4} height="h-48" />,
};
