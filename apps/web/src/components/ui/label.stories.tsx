import type { Meta, StoryObj } from '@storybook/react';
import { Label } from './label';
import { Input } from './input';

const meta: Meta<typeof Label> = {
  title: 'UI/Label',
  component: Label,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Label>;

export const Default: Story = {
  args: {
    children: 'Label text',
  },
};

export const WithHtmlFor: Story = {
  render: () => (
    <div className="flex flex-col gap-2 w-72">
      <Label htmlFor="email-input">Email address</Label>
      <Input id="email-input" type="email" placeholder="email@example.com" />
    </div>
  ),
};

export const WithDisabledInput: Story = {
  render: () => (
    <div className="flex flex-col gap-2 w-72">
      <Label htmlFor="disabled-input" className="group" data-disabled="true">
        Disabled field
      </Label>
      <Input id="disabled-input" type="text" placeholder="Disabled" disabled />
    </div>
  ),
};
