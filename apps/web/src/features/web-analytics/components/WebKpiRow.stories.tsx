import type { Meta, StoryObj } from '@storybook/react';
import type { WebAnalyticsKPIs } from '@/api/generated/Api';
import { WebKpiRow } from './WebKpiRow';

const meta: Meta<typeof WebKpiRow> = {
  title: 'WebAnalytics/WebKpiRow',
  component: WebKpiRow,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof WebKpiRow>;

const currentKpis: WebAnalyticsKPIs = {
  unique_visitors: 12400,
  pageviews: 34700,
  sessions: 18900,
  avg_duration_seconds: 187,
  bounce_rate: 42.3,
};

const previousKpis: WebAnalyticsKPIs = {
  unique_visitors: 10200,
  pageviews: 28400,
  sessions: 15600,
  avg_duration_seconds: 210,
  bounce_rate: 50.1,
};

export const Loading: Story = {
  args: {
    isLoading: true,
  },
};

export const WithData: Story = {
  args: {
    isLoading: false,
    current: currentKpis,
    previous: previousKpis,
  },
};

export const AllMetrics: Story = {
  name: 'AllMetrics — mixed trends',
  args: {
    isLoading: false,
    current: {
      unique_visitors: 12400,
      pageviews: 34700,
      sessions: 15000,
      avg_duration_seconds: 187,
      bounce_rate: 55.0,
    },
    previous: {
      unique_visitors: 10200,
      pageviews: 38000,
      sessions: 15000,
      avg_duration_seconds: 160,
      bounce_rate: 50.1,
    },
  },
};

export const Error: Story = {
  args: {
    isLoading: false,
    isError: true,
  },
};
