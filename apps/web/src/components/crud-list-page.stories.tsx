import type { Meta, StoryObj } from '@storybook/react';
import { BarChart2, GitMerge } from 'lucide-react';
import type { Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { CrudListPage } from './crud-list-page';

interface TrendItem {
  id: string;
  name: string;
  description?: string | null;
  events: number;
  updatedAt: string;
}

const extraColumns: Column<TrendItem>[] = [
  {
    key: 'events',
    header: 'Events',
    render: (row) => <Badge variant="secondary">{row.events}</Badge>,
  },
];

const SAMPLE_ITEMS: TrendItem[] = [
  {
    id: '1',
    name: 'Daily Active Users',
    description: 'Track DAU over time with a 30-day rolling window.',
    events: 3,
    updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '2',
    name: 'Page Views by Path',
    description: null,
    events: 1,
    updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '3',
    name: 'Sign-up Conversion',
    description: 'Measures the rate from landing page visit to sign-up completion.',
    events: 2,
    updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

const meta: Meta = {
  title: 'Components/CrudListPage',
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    // Default: with project
    memoryRouter: {
      initialEntries: ['/projects/proj-demo/trends'],
      path: '/projects/:projectId/trends',
    },
  },
};

export default meta;
type Story = StoryObj;

/** Loading state — skeleton shown while data is fetching. */
export const Loading: Story = {
  render: () => (
    <CrudListPage
      title="Trends"
      icon={BarChart2}
      linkNew="new"
      linkDetail={(id) => id}
      newLabel="New Trend"
      entityLabel="trend"
      columns={extraColumns}
      data={undefined}
      isLoading={true}
      onDelete={async () => {}}
      emptyTitle="No trends yet"
      emptyDescription="Create your first trend to start tracking metrics."
    />
  ),
};

/** Empty — no project selected. Shows "select a project" EmptyState. */
export const EmptyNoProject: Story = {
  parameters: {
    memoryRouter: {
      initialEntries: ['/trends'],
      path: '/trends',
    },
  },
  render: () => (
    <CrudListPage
      title="Trends"
      icon={BarChart2}
      linkNew="new"
      linkDetail={(id) => id}
      newLabel="New Trend"
      entityLabel="trend"
      columns={extraColumns}
      data={[]}
      isLoading={false}
      onDelete={async () => {}}
      emptyTitle="No trends yet"
      emptyDescription="Create your first trend to start tracking metrics."
    />
  ),
};

/** Empty — project selected but no items. */
export const EmptyNoData: Story = {
  render: () => (
    <CrudListPage
      title="Trends"
      icon={BarChart2}
      linkNew="new"
      linkDetail={(id) => id}
      newLabel="New Trend"
      entityLabel="trend"
      columns={extraColumns}
      data={[]}
      isLoading={false}
      onDelete={async () => {}}
      emptyTitle="No trends yet"
      emptyDescription="Create your first trend to start tracking metrics."
    />
  ),
};

/** Empty without action button. */
export const EmptyNoAction: Story = {
  render: () => (
    <CrudListPage
      title="Funnels"
      icon={GitMerge}
      linkNew="new"
      linkDetail={(id) => id}
      newLabel="New Funnel"
      entityLabel="funnel"
      columns={[]}
      data={[]}
      isLoading={false}
      onDelete={async () => {}}
      emptyTitle="No funnels yet"
      emptyDescription="Build your first funnel to understand conversion."
      showEmptyAction={false}
    />
  ),
};

/** Populated — list with items and action buttons. */
export const Populated: Story = {
  render: () => (
    <CrudListPage
      title="Trends"
      icon={BarChart2}
      linkNew="new"
      linkDetail={(id) => id}
      newLabel="New Trend"
      entityLabel="trend"
      columns={extraColumns}
      data={SAMPLE_ITEMS}
      isLoading={false}
      onDelete={async () => {}}
      emptyTitle="No trends yet"
      emptyDescription="Create your first trend to start tracking metrics."
    />
  ),
};
