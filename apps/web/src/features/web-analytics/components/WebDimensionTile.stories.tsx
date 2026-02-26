import type { Meta, StoryObj } from '@storybook/react';
import type { WebAnalyticsDimensionRow } from '@/api/generated/Api';
import { WebDimensionTile } from './WebDimensionTile';

const meta: Meta = {
  title: 'WebAnalytics/WebDimensionTile',
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj;

const pageTabs = [
  { id: 'top_pages', label: 'Top Pages' },
  { id: 'entry_pages', label: 'Entry Pages' },
  { id: 'exit_pages', label: 'Exit Pages' },
] as const;

type PageTab = (typeof pageTabs)[number]['id'];

const topPages: WebAnalyticsDimensionRow[] = [
  { name: '/home', visitors: 4200, pageviews: 6100 },
  { name: '/pricing', visitors: 2800, pageviews: 3900 },
  { name: '/docs/quickstart', visitors: 1900, pageviews: 2600 },
  { name: '/blog/analytics-guide', visitors: 1400, pageviews: 1950 },
  { name: '/login', visitors: 980, pageviews: 1200 },
];

const entryPages: WebAnalyticsDimensionRow[] = [
  { name: '/home', visitors: 3100, pageviews: 3100 },
  { name: '/pricing', visitors: 1500, pageviews: 1500 },
  { name: '/blog/analytics-guide', visitors: 900, pageviews: 900 },
];

const exitPages: WebAnalyticsDimensionRow[] = [
  { name: '/pricing', visitors: 1800, pageviews: 2100 },
  { name: '/login', visitors: 760, pageviews: 900 },
  { name: '/home', visitors: 620, pageviews: 750 },
];

const sourceTabs = [
  { id: 'referrers', label: 'Referrers' },
  { id: 'utm_sources', label: 'UTM Sources' },
  { id: 'utm_campaigns', label: 'Campaigns' },
] as const;

type SourceTab = (typeof sourceTabs)[number]['id'];

const referrers: WebAnalyticsDimensionRow[] = [
  { name: 'google.com', visitors: 5400, pageviews: 9200 },
  { name: 'twitter.com', visitors: 1800, pageviews: 2600 },
  { name: 'github.com', visitors: 950, pageviews: 1300 },
];

export const WithData: Story = {
  render: () => (
    <div className="max-w-lg">
      <WebDimensionTile<PageTab>
        title="Pages"
        tabs={pageTabs}
        data={{
          top_pages: topPages,
          entry_pages: entryPages,
          exit_pages: exitPages,
        }}
        isLoading={false}
      />
    </div>
  ),
};

export const Loading: Story = {
  render: () => (
    <div className="max-w-lg">
      <WebDimensionTile<PageTab>
        title="Pages"
        tabs={pageTabs}
        data={{
          top_pages: undefined,
          entry_pages: undefined,
          exit_pages: undefined,
        }}
        isLoading={true}
      />
    </div>
  ),
};

export const Empty: Story = {
  render: () => (
    <div className="max-w-lg">
      <WebDimensionTile<PageTab>
        title="Pages"
        tabs={pageTabs}
        data={{
          top_pages: [],
          entry_pages: [],
          exit_pages: [],
        }}
        isLoading={false}
      />
    </div>
  ),
};

export const LongRows: Story = {
  render: () => (
    <div className="max-w-lg">
      <WebDimensionTile<PageTab>
        title="Pages"
        tabs={pageTabs}
        data={{
          top_pages: [
            { name: '/blog/how-to-implement-real-time-analytics-in-your-application', visitors: 4200, pageviews: 6100 },
            { name: '/docs/getting-started/installation-and-configuration', visitors: 2800, pageviews: 3900 },
            { name: '/pricing/enterprise/custom-plans-and-contracts', visitors: 1900, pageviews: 2600 },
            { name: '/changelog/2024/feature-releases-and-bug-fixes', visitors: 1400, pageviews: 1950 },
            { name: '/case-studies/acme-corp-analytics-success-story', visitors: 980, pageviews: 1200 },
          ],
          entry_pages: entryPages,
          exit_pages: exitPages,
        }}
        isLoading={false}
      />
    </div>
  ),
};

export const SourcesWithData: Story = {
  name: 'Sources — WithData',
  render: () => (
    <div className="max-w-lg">
      <WebDimensionTile<SourceTab>
        title="Sources"
        tabs={sourceTabs}
        data={{
          referrers: referrers,
          utm_sources: [
            { name: 'newsletter', visitors: 2100, pageviews: 3000 },
            { name: 'google', visitors: 1600, pageviews: 2200 },
          ],
          utm_campaigns: [
            { name: 'spring-launch-2024', visitors: 890, pageviews: 1200 },
          ],
        }}
        isLoading={false}
      />
    </div>
  ),
};
