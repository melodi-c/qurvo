import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { MemoryRouter } from 'react-router-dom';
import { EditorHeader } from './editor-header';

const meta: Meta<typeof EditorHeader> = {
  title: 'UI/EditorHeader',
  component: EditorHeader,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof EditorHeader>;

export const Default: Story = {
  render: () => {
    const [name, setName] = useState('My Trend Analysis');
    return (
      <EditorHeader
        backPath="/trends"
        backLabel="Trends"
        name={name}
        onNameChange={setName}
        placeholder="Untitled trend"
        onSave={() => {}}
        isSaving={false}
        isValid={true}
      />
    );
  },
};

export const Saving: Story = {
  render: () => (
    <EditorHeader
      backPath="/trends"
      backLabel="Trends"
      name="My Trend Analysis"
      onNameChange={() => {}}
      placeholder="Untitled trend"
      onSave={() => {}}
      isSaving={true}
      isValid={true}
    />
  ),
};

export const WithError: Story = {
  render: () => (
    <EditorHeader
      backPath="/trends"
      backLabel="Trends"
      name="My Trend Analysis"
      onNameChange={() => {}}
      placeholder="Untitled trend"
      onSave={() => {}}
      isSaving={false}
      isValid={true}
      saveError="Failed to save. Please try again."
    />
  ),
};

export const InvalidForm: Story = {
  render: () => (
    <EditorHeader
      backPath="/funnels"
      backLabel="Funnels"
      name=""
      onNameChange={() => {}}
      placeholder="Untitled funnel"
      onSave={() => {}}
      isSaving={false}
      isValid={false}
    />
  ),
};

export const WithDescription: Story = {
  render: () => {
    const [name, setName] = useState('Activation Funnel');
    const [description, setDescription] = useState('Tracks user activation from signup to first value moment.');
    return (
      <EditorHeader
        backPath="/funnels"
        backLabel="Funnels"
        name={name}
        onNameChange={setName}
        placeholder="Untitled funnel"
        description={description}
        onDescriptionChange={setDescription}
        descriptionPlaceholder="Add description..."
        onSave={() => {}}
        isSaving={false}
        isValid={true}
      />
    );
  },
};
