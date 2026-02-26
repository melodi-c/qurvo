import type { Meta, StoryObj } from '@storybook/react';
import { Input } from './input';

const meta: Meta<typeof Input> = {
  title: 'UI/Input',
  component: Input,
  tags: ['autodocs'],
  argTypes: {
    disabled: { control: 'boolean' },
    readOnly: { control: 'boolean' },
    placeholder: { control: 'text' },
    type: {
      control: 'select',
      options: ['text', 'email', 'password', 'number', 'search'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = {
  args: {
    type: 'text',
  },
};

export const WithPlaceholder: Story = {
  args: {
    type: 'text',
    placeholder: 'Enter a value...',
  },
};

export const Disabled: Story = {
  args: {
    type: 'text',
    placeholder: 'Disabled input',
    disabled: true,
  },
};

export const ReadOnly: Story = {
  args: {
    type: 'text',
    value: 'Read-only value',
    readOnly: true,
  },
};

export const AllStates: Story = {
  render: () => (
    <div className="flex flex-col gap-3 w-72">
      <Input type="text" placeholder="Default" />
      <Input type="text" placeholder="Disabled" disabled />
      <Input type="text" value="Read-only" readOnly />
      <Input type="password" placeholder="Password" />
      <Input type="email" placeholder="email@example.com" />
    </div>
  ),
};
