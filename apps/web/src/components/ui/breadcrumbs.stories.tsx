import type { Meta, StoryObj } from '@storybook/react';
import { Breadcrumbs } from './breadcrumbs';

const meta: Meta<typeof Breadcrumbs> = {
  title: 'UI/Breadcrumbs',
  component: Breadcrumbs,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Breadcrumbs>;

export const SingleItem: Story = {
  render: () => (
    <Breadcrumbs items={[{ label: 'Trends' }]} />
  ),
};

export const TwoItems: Story = {
  render: () => (
    <Breadcrumbs
      items={[
        { label: 'Trends', path: '/trends' },
        { label: 'Weekly Active Users' },
      ]}
    />
  ),
};

export const ThreeItems: Story = {
  render: () => (
    <Breadcrumbs
      items={[
        { label: 'Projects', path: '/projects' },
        { label: 'Acme Corp', path: '/projects/123' },
        { label: 'Settings' },
      ]}
    />
  ),
};

export const AllLinks: Story = {
  render: () => (
    <Breadcrumbs
      items={[
        { label: 'Home', path: '/' },
        { label: 'Projects', path: '/projects' },
        { label: 'Acme Corp', path: '/projects/123' },
        { label: 'Funnels', path: '/projects/123/funnels' },
        { label: 'Activation Funnel' },
      ]}
    />
  ),
};

export const LongLabel: Story = {
  render: () => (
    <div className="max-w-sm">
      <Breadcrumbs
        items={[
          { label: 'Funnels', path: '/funnels' },
          { label: 'A very long funnel name that might get truncated in narrow containers' },
        ]}
      />
    </div>
  ),
};
