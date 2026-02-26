import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Cohort } from '@/api/generated/Api';
import { CohortFilterSection } from './cohort-filter-section';

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
  {
    id: 'cohort-4',
    name: 'Mobile Users',
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

const meta: Meta<typeof CohortFilterSection> = {
  title: 'UI/CohortFilterSection',
  component: CohortFilterSection,
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
type Story = StoryObj<typeof CohortFilterSection>;

export const Empty: Story = {
  render: () => {
    const [value, setValue] = useState<string[]>([]);
    return (
      <div className="w-72 p-4">
        <CohortFilterSection value={value} onChange={setValue} />
      </div>
    );
  },
};

export const WithSelectedCohorts: Story = {
  render: () => {
    const [value, setValue] = useState<string[]>(['cohort-1', 'cohort-3']);
    return (
      <div className="w-72 p-4">
        <CohortFilterSection value={value} onChange={setValue} />
      </div>
    );
  },
};
