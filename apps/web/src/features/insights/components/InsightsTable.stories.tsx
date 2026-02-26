import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InsightsTable } from './InsightsTable';
import type { Insight } from '@/api/generated/Api';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const meta: Meta = {
  title: 'Insights/InsightsTable',
  parameters: {
    layout: 'padded',
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <Story />
      </QueryClientProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj;

const insightsMock: Insight[] = [
  {
    id: '1',
    type: 'trend',
    name: 'Daily Active Users',
    description: 'Tracks unique users performing any event per day',
    is_favorite: true,
    project_id: 'proj1',
    created_by: 'user1',
    created_at: '2026-01-10T12:00:00Z',
    updated_at: '2026-02-20T09:30:00Z',
    config: {
      type: 'trend',
      series: [
        { event_name: '$pageview', label: 'Pageviews', filters: [] },
        { event_name: '$identify', label: 'Identities', filters: [] },
      ],
      metric: 'total_events',
      granularity: 'day',
      chart_type: 'line',
      date_from: '2026-01-28',
      date_to: '2026-02-27',
      compare: false,
    },
  },
  {
    id: '2',
    type: 'funnel',
    name: 'Signup Funnel',
    description: null,
    is_favorite: false,
    project_id: 'proj1',
    created_by: 'user1',
    created_at: '2026-01-15T08:00:00Z',
    updated_at: '2026-02-18T14:00:00Z',
    config: {
      type: 'funnel',
      steps: [
        { event_name: '$pageview', label: 'Landed', filters: [] },
        { event_name: 'signup_started', label: 'Started Signup', filters: [] },
        { event_name: 'signup_completed', label: 'Completed Signup', filters: [] },
      ],
      conversion_window_days: 14,
      date_from: '2026-01-28',
      date_to: '2026-02-27',
    },
  },
  {
    id: '3',
    type: 'retention',
    name: 'Weekly Retention',
    description: null,
    is_favorite: false,
    project_id: 'proj1',
    created_by: 'user1',
    created_at: '2026-01-20T10:00:00Z',
    updated_at: '2026-02-15T11:00:00Z',
    config: {
      type: 'retention',
      target_event: '$pageview',
      retention_type: 'first_time',
      granularity: 'week',
      periods: 8,
      date_from: '2026-01-01',
      date_to: '2026-02-27',
      cohort_ids: [],
    },
  },
  {
    id: '4',
    type: 'lifecycle',
    name: 'User Lifecycle',
    description: 'New, returning, resurrecting, dormant user breakdown',
    is_favorite: true,
    project_id: 'proj1',
    created_by: 'user1',
    created_at: '2026-02-01T09:00:00Z',
    updated_at: '2026-02-25T16:00:00Z',
    config: {
      type: 'lifecycle',
      target_event: '$pageview',
      granularity: 'day',
      date_from: '2026-01-01',
      date_to: '2026-02-27',
      cohort_ids: [],
    },
  },
  {
    id: '5',
    type: 'stickiness',
    name: 'Feature Stickiness',
    description: null,
    is_favorite: false,
    project_id: 'proj1',
    created_by: 'user1',
    created_at: '2026-02-05T08:00:00Z',
    updated_at: '2026-02-22T13:00:00Z',
    config: {
      type: 'stickiness',
      target_event: 'feature_used',
      granularity: 'week',
      date_from: '2026-01-01',
      date_to: '2026-02-27',
      cohort_ids: [],
    },
  },
];

export const Populated: Story = {
  render: () => (
    <div className="max-w-4xl">
      <InsightsTable
        data={insightsMock}
        onToggleFavorite={() => {}}
        onDelete={async () => {}}
      />
    </div>
  ),
};

export const Empty: Story = {
  render: () => (
    <div className="max-w-4xl">
      <InsightsTable
        data={[]}
        onToggleFavorite={() => {}}
        onDelete={async () => {}}
      />
    </div>
  ),
};

export const WithFavorites: Story = {
  name: 'WithFavorites — starred items',
  render: () => (
    <div className="max-w-4xl">
      <InsightsTable
        data={insightsMock.map((item, i) => ({ ...item, is_favorite: i % 2 === 0 }))}
        onToggleFavorite={() => {}}
        onDelete={async () => {}}
      />
    </div>
  ),
};

export const SingleItem: Story = {
  name: 'SingleItem — one row',
  render: () => (
    <div className="max-w-4xl">
      <InsightsTable
        data={[insightsMock[0]]}
        onToggleFavorite={() => {}}
        onDelete={async () => {}}
      />
    </div>
  ),
};
