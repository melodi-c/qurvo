import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import type { StepFilter } from '@/api/generated/Api';
import { StepFilterRow } from './StepFilterRow';

const meta: Meta<typeof StepFilterRow> = {
  title: 'Components/StepFilterRow',
  component: StepFilterRow,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof StepFilterRow>;

const PROPERTY_NAMES = [
  'properties.plan',
  'properties.country',
  'properties.device_type',
  'properties.referrer',
  'properties.page_path',
];

const PROPERTY_DESCRIPTIONS: Record<string, string> = {
  'properties.plan': 'Subscription plan',
  'properties.country': 'User country',
  'properties.device_type': 'Device type',
  'properties.referrer': 'Referrer URL',
  'properties.page_path': 'Page path',
};

function Controlled({ initialFilter }: { initialFilter: StepFilter }) {
  const [filter, setFilter] = useState<StepFilter>(initialFilter);
  return (
    <div className="w-80">
      <StepFilterRow
        filter={filter}
        onChange={setFilter}
        onRemove={() => {}}
        propertyNames={PROPERTY_NAMES}
        propertyDescriptions={PROPERTY_DESCRIPTIONS}
      />
    </div>
  );
}

/** Operator: equals (eq) — default operator with a value. */
export const OperatorEquals: Story = {
  render: () => (
    <Controlled
      initialFilter={{ property: 'properties.plan', operator: 'eq', value: 'pro' }}
    />
  ),
};

/** Operator: not equals (neq). */
export const OperatorNotEquals: Story = {
  render: () => (
    <Controlled
      initialFilter={{ property: 'properties.country', operator: 'neq', value: 'US' }}
    />
  ),
};

/** Operator: contains — shows value input. */
export const OperatorContains: Story = {
  render: () => (
    <Controlled
      initialFilter={{ property: 'properties.page_path', operator: 'contains', value: '/dashboard' }}
    />
  ),
};

/** Operator: does not contain. */
export const OperatorNotContains: Story = {
  render: () => (
    <Controlled
      initialFilter={{ property: 'properties.referrer', operator: 'not_contains', value: 'google' }}
    />
  ),
};

/** Operator: is_set — hides value input and shows a hint. */
export const OperatorIsSet: Story = {
  render: () => (
    <Controlled
      initialFilter={{ property: 'properties.plan', operator: 'is_set', value: '' }}
    />
  ),
};

/** Operator: is_not_set — hides value input and shows a hint. */
export const OperatorIsNotSet: Story = {
  render: () => (
    <Controlled
      initialFilter={{ property: 'properties.device_type', operator: 'is_not_set', value: '' }}
    />
  ),
};

/** Without propertyNames — uses plain Input for property. */
export const WithoutPropertyNames: Story = {
  render: () => {
    const [filter, setFilter] = useState<StepFilter>({
      property: 'properties.custom',
      operator: 'eq',
      value: 'test',
    });
    return (
      <div className="w-80">
        <StepFilterRow
          filter={filter}
          onChange={setFilter}
          onRemove={() => {}}
        />
      </div>
    );
  },
};

/** Empty filter — fresh state before user fills in anything. */
export const Empty: Story = {
  render: () => {
    const [filter, setFilter] = useState<StepFilter>({
      property: '',
      operator: 'eq',
      value: '',
    });
    return (
      <div className="w-80">
        <StepFilterRow
          filter={filter}
          onChange={setFilter}
          onRemove={() => {}}
          propertyNames={PROPERTY_NAMES}
          propertyDescriptions={PROPERTY_DESCRIPTIONS}
        />
      </div>
    );
  },
};
