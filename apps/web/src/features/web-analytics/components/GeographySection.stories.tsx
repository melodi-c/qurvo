import type { Meta, StoryObj } from '@storybook/react';
import type { WebAnalyticsDimensionRow } from '@/api/generated/Api';
import { GeographySection } from './GeographySection';

const meta: Meta = {
  title: 'WebAnalytics/GeographySection',
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj;

const countries: WebAnalyticsDimensionRow[] = [
  { name: 'US', visitors: 5400, pageviews: 9200 },
  { name: 'DE', visitors: 2100, pageviews: 3500 },
  { name: 'GB', visitors: 1800, pageviews: 3000 },
  { name: 'FR', visitors: 1200, pageviews: 2000 },
  { name: 'CA', visitors: 950, pageviews: 1600 },
  { name: 'AU', visitors: 820, pageviews: 1300 },
  { name: 'NL', visitors: 600, pageviews: 980 },
  { name: 'BR', visitors: 550, pageviews: 870 },
  { name: 'IN', visitors: 480, pageviews: 780 },
  { name: 'JP', visitors: 420, pageviews: 680 },
];

const regions: WebAnalyticsDimensionRow[] = [
  { name: 'California', visitors: 1800, pageviews: 3100 },
  { name: 'New York', visitors: 1400, pageviews: 2400 },
  { name: 'Texas', visitors: 900, pageviews: 1500 },
  { name: 'Bavaria', visitors: 750, pageviews: 1200 },
  { name: 'Île-de-France', visitors: 620, pageviews: 980 },
];

const cities: WebAnalyticsDimensionRow[] = [
  { name: 'San Francisco', visitors: 820, pageviews: 1450 },
  { name: 'New York City', visitors: 760, pageviews: 1300 },
  { name: 'London', visitors: 640, pageviews: 1100 },
  { name: 'Berlin', visitors: 480, pageviews: 800 },
  { name: 'Paris', visitors: 420, pageviews: 700 },
  { name: 'Toronto', visitors: 380, pageviews: 620 },
];

export const WithData: Story = {
  name: 'WithData — world map with countries',
  render: () => (
    <div className="max-w-2xl">
      <GeographySection
        countries={countries}
        regions={regions}
        cities={cities}
        isLoading={false}
      />
    </div>
  ),
};

export const Loading: Story = {
  name: 'Loading — map and table skeletons',
  render: () => (
    <div className="max-w-2xl">
      <GeographySection
        countries={undefined}
        regions={undefined}
        cities={undefined}
        isLoading={true}
      />
    </div>
  ),
};

export const Empty: Story = {
  name: 'Empty — no data',
  render: () => (
    <div className="max-w-2xl">
      <GeographySection
        countries={[]}
        regions={[]}
        cities={[]}
        isLoading={false}
      />
    </div>
  ),
};

export const Error: Story = {
  name: 'Error — load failed',
  render: () => (
    <div className="max-w-2xl">
      <GeographySection
        countries={[]}
        regions={[]}
        cities={[]}
        isLoading={false}
        isError={true}
      />
    </div>
  ),
};

export const FewCountries: Story = {
  name: 'FewCountries — 3 countries',
  render: () => (
    <div className="max-w-2xl">
      <GeographySection
        countries={countries.slice(0, 3)}
        regions={regions.slice(0, 2)}
        cities={cities.slice(0, 3)}
        isLoading={false}
      />
    </div>
  ),
};
