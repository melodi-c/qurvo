import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EventDetail, type EventLike } from './event-detail';

const SAMPLE_EVENT: EventLike = {
  event_id: 'evt-001',
  event_name: '$pageview',
  event_type: 'pageview',
  distinct_id: 'user-abc123',
  person_id: 'person-xyz456',
  session_id: 'sess-001',
  timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  url: 'https://app.example.com/dashboard',
  referrer: 'https://google.com',
  page_title: 'Dashboard — Qurvo',
  page_path: '/dashboard',
  device_type: 'desktop',
  browser: 'Chrome',
  browser_version: '121',
  os: 'macOS',
  os_version: '14.2',
  screen_width: 1920,
  screen_height: 1080,
  country: 'US',
  region: 'California',
  city: 'San Francisco',
  language: 'en-US',
  timezone: 'America/Los_Angeles',
  sdk_name: '@qurvo/sdk-browser',
  sdk_version: '1.2.0',
  properties: JSON.stringify({ plan: 'pro', trial: false, page_views: 42 }),
  user_properties: JSON.stringify({ email: 'user@example.com', name: 'Alice Johnson', plan: 'pro' }),
};

const IDENTIFY_EVENT: EventLike = {
  ...SAMPLE_EVENT,
  event_id: 'evt-002',
  event_name: '$identify',
  event_type: 'identify',
  url: '',
  referrer: '',
  page_title: '',
  page_path: '',
  properties: JSON.stringify({ $anon_distinct_id: 'anon-123' }),
  user_properties: JSON.stringify({
    email: 'bob@example.com',
    name: 'Bob Smith',
    company: 'Acme Corp',
    plan: 'enterprise',
  }),
};

const CUSTOM_EVENT: EventLike = {
  ...SAMPLE_EVENT,
  event_id: 'evt-003',
  event_name: 'button_clicked',
  event_type: 'custom',
  url: 'https://app.example.com/onboarding',
  page_path: '/onboarding',
  page_title: 'Onboarding — Qurvo',
  properties: JSON.stringify({
    button_id: 'cta-hero',
    button_label: 'Get Started',
    section: 'hero',
  }),
  user_properties: undefined,
};

function makeQueryClient(eventDetails?: Record<string, { properties?: string; user_properties?: string }>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // Pre-seed event detail queries so the component shows data without real API calls
  if (eventDetails) {
    for (const [eventId, detail] of Object.entries(eventDetails)) {
      qc.setQueryData(['event-detail', eventId, 'proj-demo'], detail);
    }
  }
  return qc;
}

const meta: Meta = {
  title: 'Components/EventDetail',
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={makeQueryClient({
        'evt-001': {
          properties: SAMPLE_EVENT.properties,
          user_properties: SAMPLE_EVENT.user_properties,
        },
        'evt-002': {
          properties: IDENTIFY_EVENT.properties,
          user_properties: IDENTIFY_EVENT.user_properties,
        },
        'evt-003': {
          properties: CUSTOM_EVENT.properties,
          user_properties: CUSTOM_EVENT.user_properties,
        },
      })}>
        <Story />
      </QueryClientProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj;

/** Event tab — shows all event metadata grouped by category. */
export const EventTab: Story = {
  render: () => (
    <div className="max-w-xl border border-border rounded-lg overflow-hidden">
      <EventDetail event={SAMPLE_EVENT} projectId="proj-demo" />
    </div>
  ),
};

/** Person tab — shows user properties (click the Person tab to switch). */
export const PersonTab: Story = {
  render: () => (
    <div className="max-w-xl border border-border rounded-lg overflow-hidden">
      <EventDetail event={SAMPLE_EVENT} projectId="proj-demo" />
    </div>
  ),
};

/** $identify event — user properties populated. */
export const IdentifyEvent: Story = {
  render: () => (
    <div className="max-w-xl border border-border rounded-lg overflow-hidden">
      <EventDetail event={IDENTIFY_EVENT} projectId="proj-demo" />
    </div>
  ),
};

/** Custom event with properties. */
export const CustomEventWithProperties: Story = {
  render: () => (
    <div className="max-w-xl border border-border rounded-lg overflow-hidden">
      <EventDetail event={CUSTOM_EVENT} projectId="proj-demo" />
    </div>
  ),
};

/** No project — person links are plain text, no API call for extra properties. */
export const WithoutProject: Story = {
  render: () => (
    <div className="max-w-xl border border-border rounded-lg overflow-hidden">
      <EventDetail event={SAMPLE_EVENT} />
    </div>
  ),
};
