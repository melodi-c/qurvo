import type { Meta, StoryObj } from '@storybook/react';
import {
  PAGE_ROWS,
  ENTRY_PAGE_ROWS,
  EXIT_PAGE_ROWS,
  SOURCE_ROWS,
  UTM_SOURCE_ROWS,
  UTM_CAMPAIGN_ROWS,
} from '@/stories/mocks/web-analytics.mock';
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

const sourceTabs = [
  { id: 'referrers', label: 'Referrers' },
  { id: 'utm_sources', label: 'UTM Sources' },
  { id: 'utm_campaigns', label: 'Campaigns' },
] as const;

type SourceTab = (typeof sourceTabs)[number]['id'];

export const WithData: Story = {
  render: () => (
    <div className="max-w-lg">
      <WebDimensionTile<PageTab>
        title="Pages"
        tabs={pageTabs}
        data={{
          top_pages: PAGE_ROWS,
          entry_pages: ENTRY_PAGE_ROWS,
          exit_pages: EXIT_PAGE_ROWS,
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
          entry_pages: ENTRY_PAGE_ROWS,
          exit_pages: EXIT_PAGE_ROWS,
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
          referrers: SOURCE_ROWS,
          utm_sources: UTM_SOURCE_ROWS,
          utm_campaigns: UTM_CAMPAIGN_ROWS,
        }}
        isLoading={false}
      />
    </div>
  ),
};
