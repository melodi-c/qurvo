import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { EventLike } from './event-detail';
import { EventTable } from './event-table';

const NOW = Date.now();

const SAMPLE_EVENTS: EventLike[] = [
  {
    event_id: 'evt-001',
    event_name: '$pageview',
    event_type: 'pageview',
    distinct_id: 'user-abc',
    person_id: 'person-1',
    session_id: 'sess-1',
    timestamp: new Date(NOW - 2 * 60 * 1000).toISOString(),
    url: 'https://app.example.com/dashboard',
    referrer: 'https://google.com',
    page_title: 'Dashboard',
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
    properties: JSON.stringify({ plan: 'pro' }),
    user_properties: JSON.stringify({ email: 'alice@example.com' }),
  },
  {
    event_id: 'evt-002',
    event_name: '$identify',
    event_type: 'identify',
    distinct_id: 'user-abc',
    person_id: 'person-1',
    session_id: 'sess-1',
    timestamp: new Date(NOW - 5 * 60 * 1000).toISOString(),
    url: '',
    referrer: '',
    page_title: '',
    page_path: '',
    device_type: 'desktop',
    browser: 'Chrome',
    browser_version: '121',
    os: 'macOS',
    os_version: '14.2',
    screen_width: 1920,
    screen_height: 1080,
    country: 'US',
    region: '',
    city: '',
    language: 'en-US',
    timezone: 'America/Los_Angeles',
    sdk_name: '@qurvo/sdk-browser',
    sdk_version: '1.2.0',
    properties: undefined,
    user_properties: JSON.stringify({ email: 'alice@example.com', plan: 'pro' }),
  },
  {
    event_id: 'evt-003',
    event_name: 'button_clicked',
    event_type: 'custom',
    distinct_id: 'user-def',
    person_id: 'person-2',
    session_id: 'sess-2',
    timestamp: new Date(NOW - 12 * 60 * 1000).toISOString(),
    url: 'https://app.example.com/onboarding',
    referrer: '',
    page_title: 'Onboarding',
    page_path: '/onboarding',
    device_type: 'mobile',
    browser: 'Safari',
    browser_version: '17',
    os: 'iOS',
    os_version: '17.2',
    screen_width: 390,
    screen_height: 844,
    country: 'GB',
    region: 'England',
    city: 'London',
    language: 'en-GB',
    timezone: 'Europe/London',
    sdk_name: '@qurvo/sdk-browser',
    sdk_version: '1.2.0',
    properties: JSON.stringify({ button_id: 'cta-hero', button_label: 'Get Started' }),
    user_properties: undefined,
  },
  {
    event_id: 'evt-004',
    event_name: '$pageview',
    event_type: 'pageview',
    distinct_id: 'user-def',
    person_id: 'person-2',
    session_id: 'sess-2',
    timestamp: new Date(NOW - 15 * 60 * 1000).toISOString(),
    url: 'https://app.example.com/pricing',
    referrer: 'https://example.com',
    page_title: 'Pricing',
    page_path: '/pricing',
    device_type: 'mobile',
    browser: 'Safari',
    browser_version: '17',
    os: 'iOS',
    os_version: '17.2',
    screen_width: 390,
    screen_height: 844,
    country: 'GB',
    region: 'England',
    city: 'London',
    language: 'en-GB',
    timezone: 'Europe/London',
    sdk_name: '@qurvo/sdk-browser',
    sdk_version: '1.2.0',
    properties: undefined,
    user_properties: undefined,
  },
  {
    event_id: 'evt-005',
    event_name: '$pageleave',
    event_type: 'pageleave',
    distinct_id: 'user-ghi',
    person_id: 'person-3',
    session_id: 'sess-3',
    timestamp: new Date(NOW - 30 * 60 * 1000).toISOString(),
    url: 'https://app.example.com/features',
    referrer: '',
    page_title: 'Features',
    page_path: '/features',
    device_type: 'desktop',
    browser: 'Firefox',
    browser_version: '122',
    os: 'Windows',
    os_version: '11',
    screen_width: 1440,
    screen_height: 900,
    country: 'DE',
    region: 'Bavaria',
    city: 'Munich',
    language: 'de-DE',
    timezone: 'Europe/Berlin',
    sdk_name: '@qurvo/sdk-browser',
    sdk_version: '1.2.0',
    properties: undefined,
    user_properties: undefined,
  },
];

function makeQueryClient() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // Pre-seed event definitions so the table doesn't make real API calls
  qc.setQueryData(['event-definitions', 'proj-demo'], []);
  // Pre-seed event detail queries for expandable rows
  for (const evt of SAMPLE_EVENTS) {
    qc.setQueryData(['event-detail', evt.event_id, 'proj-demo'], {
      properties: evt.properties,
      user_properties: evt.user_properties,
    });
  }
  return qc;
}

const meta: Meta = {
  title: 'Components/EventTable',
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    memoryRouter: {
      initialEntries: ['/projects/proj-demo/events'],
      path: '/projects/:projectId/events',
    },
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={makeQueryClient()}>
        <Story />
      </QueryClientProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj;

/** Empty state — no events. */
export const Empty: Story = {
  render: () => (
    <div className="border border-border rounded-lg overflow-hidden">
      <EventTable
        events={[]}
        projectId="proj-demo"
        page={1}
        onPageChange={() => {}}
        hasMore={false}
      />
    </div>
  ),
};

/** Populated — list of events without person column. */
export const Populated: Story = {
  render: () => {
    const [page, setPage] = useState(1);
    return (
      <div className="border border-border rounded-lg overflow-hidden">
        <EventTable
          events={SAMPLE_EVENTS}
          projectId="proj-demo"
          page={page}
          onPageChange={setPage}
          hasMore={false}
        />
      </div>
    );
  },
};

/** With person column — shows distinct_id linked to person detail. */
export const WithPersonColumn: Story = {
  render: () => {
    const [page, setPage] = useState(1);
    return (
      <div className="border border-border rounded-lg overflow-hidden">
        <EventTable
          events={SAMPLE_EVENTS}
          showPerson
          projectId="proj-demo"
          page={page}
          onPageChange={setPage}
          hasMore={false}
        />
      </div>
    );
  },
};

/** With pagination — navigable pages of events. */
export const WithPagination: Story = {
  render: () => {
    const [page, setPage] = useState(1);
    const pageSize = 3;
    const start = (page - 1) * pageSize;
    const pageData = SAMPLE_EVENTS.slice(start, start + pageSize);
    const hasMore = start + pageSize < SAMPLE_EVENTS.length;
    return (
      <div className="border border-border rounded-lg overflow-hidden">
        <EventTable
          events={pageData}
          projectId="proj-demo"
          page={page}
          onPageChange={setPage}
          hasMore={hasMore}
        />
      </div>
    );
  },
};

/** Expandable row — click any row to reveal the EventDetail panel. */
export const ExpandableRow: Story = {
  render: () => {
    const [page, setPage] = useState(1);
    return (
      <div className="border border-border rounded-lg overflow-hidden">
        <EventTable
          events={SAMPLE_EVENTS.slice(0, 3)}
          projectId="proj-demo"
          page={page}
          onPageChange={setPage}
          hasMore={false}
        />
      </div>
    );
  },
};
