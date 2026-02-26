import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Filter, User } from 'lucide-react';
import type { StepFilter } from '@/api/generated/Api';
import { FilterListSection } from './FilterListSection';

const meta: Meta<typeof FilterListSection> = {
  title: 'Components/FilterListSection',
  component: FilterListSection,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof FilterListSection>;

const PROPERTY_NAMES = [
  'properties.plan',
  'properties.country',
  'properties.device_type',
  'properties.referrer',
  'properties.page_path',
  'properties.utm_source',
];

const PROPERTY_DESCRIPTIONS: Record<string, string> = {
  'properties.plan': 'Subscription plan',
  'properties.country': 'User country',
  'properties.device_type': 'Device type',
  'properties.referrer': 'Referrer URL',
  'properties.page_path': 'Page path',
  'properties.utm_source': 'UTM source',
};

function Controlled({ initial = [] }: { initial?: StepFilter[] }) {
  const [filters, setFilters] = useState<StepFilter[]>(initial);
  return (
    <div className="w-80 p-4 border border-border rounded-lg">
      <FilterListSection
        label="Event Filters"
        addLabel="Add filter"
        filters={filters}
        onFiltersChange={setFilters}
        propertyNames={PROPERTY_NAMES}
        propertyDescriptions={PROPERTY_DESCRIPTIONS}
      />
    </div>
  );
}

/** Empty state — no filters added yet. */
export const Empty: Story = {
  render: () => <Controlled initial={[]} />,
};

/** Single filter. */
export const OneFilter: Story = {
  render: () => (
    <Controlled
      initial={[{ property: 'properties.plan', operator: 'eq', value: 'pro' }]}
    />
  ),
};

/** Multiple filters. */
export const MultipleFilters: Story = {
  render: () => (
    <Controlled
      initial={[
        { property: 'properties.plan', operator: 'eq', value: 'pro' },
        { property: 'properties.country', operator: 'neq', value: 'US' },
        { property: 'properties.device_type', operator: 'is_set', value: '' },
      ]}
    />
  ),
};

/** With a custom icon (User icon for person filters). */
export const WithCustomIcon: Story = {
  render: () => {
    const [filters, setFilters] = useState<StepFilter[]>([
      { property: 'properties.plan', operator: 'eq', value: 'enterprise' },
    ]);
    return (
      <div className="w-80 p-4 border border-border rounded-lg">
        <FilterListSection
          icon={User}
          label="Person Filters"
          addLabel="Add person filter"
          filters={filters}
          onFiltersChange={setFilters}
          propertyNames={PROPERTY_NAMES}
          propertyDescriptions={PROPERTY_DESCRIPTIONS}
        />
      </div>
    );
  },
};

/** Without property name suggestions — uses plain text input. */
export const WithoutSuggestions: Story = {
  render: () => {
    const [filters, setFilters] = useState<StepFilter[]>([
      { property: 'properties.plan', operator: 'contains', value: 'free' },
    ]);
    return (
      <div className="w-80 p-4 border border-border rounded-lg">
        <FilterListSection
          icon={Filter}
          label="Filters"
          addLabel="Add filter"
          filters={filters}
          onFiltersChange={setFilters}
        />
      </div>
    );
  },
};
