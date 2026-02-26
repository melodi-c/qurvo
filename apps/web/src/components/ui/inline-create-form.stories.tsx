import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { InlineCreateForm } from './inline-create-form';

const meta: Meta<typeof InlineCreateForm> = {
  title: 'UI/InlineCreateForm',
  component: InlineCreateForm,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof InlineCreateForm>;

export const Default: Story = {
  render: () => {
    const [value, setValue] = useState('');
    return (
      <div className="max-w-lg">
        <InlineCreateForm
          placeholder="New project name"
          value={value}
          onChange={setValue}
          isPending={false}
          onSubmit={() => {}}
          onCancel={() => {}}
        />
      </div>
    );
  },
};

export const Pending: Story = {
  render: () => (
    <div className="max-w-lg">
      <InlineCreateForm
        placeholder="New project name"
        value="My Analytics Project"
        onChange={() => {}}
        isPending={true}
        onSubmit={() => {}}
        onCancel={() => {}}
      />
    </div>
  ),
};

export const WithCustomLabels: Story = {
  render: () => {
    const [value, setValue] = useState('');
    return (
      <div className="max-w-lg">
        <InlineCreateForm
          placeholder="Dashboard name..."
          value={value}
          onChange={setValue}
          isPending={false}
          onSubmit={() => {}}
          onCancel={() => {}}
          submitLabel="Add Dashboard"
          pendingLabel="Adding..."
          autoFocus
        />
      </div>
    );
  },
};

export const PendingWithCustomLabel: Story = {
  render: () => (
    <div className="max-w-lg">
      <InlineCreateForm
        placeholder="API key name"
        value="Production Key"
        onChange={() => {}}
        isPending={true}
        onSubmit={() => {}}
        onCancel={() => {}}
        submitLabel="Generate Key"
        pendingLabel="Generating..."
      />
    </div>
  ),
};
