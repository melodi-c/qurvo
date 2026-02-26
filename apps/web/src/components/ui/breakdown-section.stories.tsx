import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Cohort } from '@/api/generated/Api';
import { BreakdownSection } from './breakdown-section';

const MOCK_COHORTS: Cohort[] = [
  {
    id: 'cohort-1',
    name: 'Power Users',
    project_id: 'proj-1',
    created_by: 'user-1',
    is_static: false,
    errors_calculating: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'cohort-2',
    name: 'Churned Users',
    project_id: 'proj-1',
    created_by: 'user-1',
    is_static: true,
    errors_calculating: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'cohort-3',
    name: 'New Signups',
    project_id: 'proj-1',
    created_by: 'user-1',
    is_static: false,
    errors_calculating: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

function makeQueryClient(cohorts: Cohort[] = MOCK_COHORTS) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // In Storybook, useProjectId() returns '' (no URL params), so the query key is ['cohorts', ''].
  // Seeding the cache lets CohortSelector display mock data without making a real API call.
  qc.setQueryData(['cohorts', ''], cohorts);
  return qc;
}

const SAMPLE_PROPERTY_NAMES = [
  'properties.plan',
  'properties.utm_source',
  'properties.utm_medium',
  'country',
  'browser',
  'os',
];

const SAMPLE_DESCRIPTIONS: Record<string, string> = {
  'properties.plan': 'Subscription plan',
  'properties.utm_source': 'UTM source parameter',
  'properties.utm_medium': 'UTM medium parameter',
  country: 'Country of the user',
  browser: 'Browser name',
  os: 'Operating system',
};

const meta: Meta<typeof BreakdownSection> = {
  title: 'UI/BreakdownSection',
  component: BreakdownSection,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <QueryClientProvider client={makeQueryClient()}>
        <Story />
      </QueryClientProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof BreakdownSection>;

export const Empty: Story = {
  render: () => {
    const [value, setValue] = useState('');
    return (
      <div className="w-72 p-4">
        <BreakdownSection value={value} onChange={setValue} />
      </div>
    );
  },
};

export const WithProperty: Story = {
  render: () => {
    const [value, setValue] = useState('properties.plan');
    return (
      <div className="w-72 p-4">
        <BreakdownSection
          value={value}
          onChange={setValue}
          propertyNames={SAMPLE_PROPERTY_NAMES}
          propertyDescriptions={SAMPLE_DESCRIPTIONS}
        />
      </div>
    );
  },
};

export const WithGeoPresets: Story = {
  render: () => {
    const [value, setValue] = useState('country');
    return (
      <div className="w-72 p-4">
        <BreakdownSection
          value={value}
          onChange={setValue}
          propertyNames={SAMPLE_PROPERTY_NAMES}
          propertyDescriptions={SAMPLE_DESCRIPTIONS}
        />
      </div>
    );
  },
};

export const WithCohort: Story = {
  render: () => {
    const [value, setValue] = useState('');
    const [breakdownType, setBreakdownType] = useState<'property' | 'cohort'>('cohort');
    const [cohortIds, setCohortIds] = useState<string[]>(['cohort-1', 'cohort-2']);
    return (
      <div className="w-72 p-4">
        <BreakdownSection
          value={value}
          onChange={setValue}
          breakdownType={breakdownType}
          onBreakdownTypeChange={setBreakdownType}
          breakdownCohortIds={cohortIds}
          onBreakdownCohortIdsChange={setCohortIds}
        />
      </div>
    );
  },
};

export const WithTypeToggle: Story = {
  render: () => {
    const [value, setValue] = useState('');
    const [breakdownType, setBreakdownType] = useState<'property' | 'cohort'>('property');
    const [cohortIds, setCohortIds] = useState<string[]>([]);
    return (
      <div className="w-72 p-4">
        <BreakdownSection
          value={value}
          onChange={setValue}
          breakdownType={breakdownType}
          onBreakdownTypeChange={setBreakdownType}
          breakdownCohortIds={cohortIds}
          onBreakdownCohortIdsChange={setCohortIds}
          tooltip="Split your results by a property or compare cohorts side by side"
        />
      </div>
    );
  },
};
