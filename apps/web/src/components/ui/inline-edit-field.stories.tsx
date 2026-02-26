import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { InlineEditField } from './inline-edit-field';

const meta: Meta<typeof InlineEditField> = {
  title: 'UI/InlineEditField',
  component: InlineEditField,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof InlineEditField>;

export const Display: Story = {
  render: () => {
    const [value, setValue] = useState('My Analytics Project');
    return (
      <div className="flex items-center gap-2 p-4">
        <span className="text-sm text-muted-foreground">Name:</span>
        <InlineEditField value={value} onSave={setValue} />
      </div>
    );
  },
};

export const Editing: Story = {
  render: () => {
    const [value, setValue] = useState('Production API Key');
    return (
      <div className="flex items-center gap-2 p-4">
        <span className="text-sm text-muted-foreground">Key name:</span>
        <InlineEditField
          value={value}
          onSave={(v) => {
            setValue(v);
          }}
        />
      </div>
    );
  },
};

export const Saving: Story = {
  render: () => (
    <div className="flex items-center gap-2 p-4">
      <span className="text-sm text-muted-foreground">Name:</span>
      <InlineEditField
        value="Updated Project Name"
        onSave={() => new Promise((resolve) => setTimeout(resolve, 2000))}
        isPending={true}
      />
    </div>
  ),
};

export const ReadOnly: Story = {
  render: () => (
    <div className="flex items-center gap-2 p-4">
      <span className="text-sm text-muted-foreground">Token:</span>
      <InlineEditField
        value="sk-prod-a1b2c3d4e5f6"
        onSave={() => {}}
        readOnly={true}
      />
    </div>
  ),
};

export const WithCustomLabels: Story = {
  render: () => {
    const [value, setValue] = useState('Marketing Dashboard');
    return (
      <div className="flex items-center gap-2 p-4">
        <span className="text-sm text-muted-foreground">Title:</span>
        <InlineEditField
          value={value}
          onSave={setValue}
          saveLabel="Update"
          savingLabel="Updating..."
          cancelLabel="Discard"
        />
      </div>
    );
  },
};
