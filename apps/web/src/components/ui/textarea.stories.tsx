import type { Meta, StoryObj } from '@storybook/react';
import { Textarea } from './textarea';
import { Label } from './label';

const meta: Meta<typeof Textarea> = {
  title: 'UI/Textarea',
  component: Textarea,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Textarea>;

export const Default: Story = {
  render: () => (
    <div className="w-80 space-y-1.5">
      <Label htmlFor="default-textarea">Description</Label>
      <Textarea id="default-textarea" placeholder="Enter a description..." />
    </div>
  ),
};

export const WithValue: Story = {
  render: () => (
    <div className="w-80 space-y-1.5">
      <Label htmlFor="value-textarea">Notes</Label>
      <Textarea
        id="value-textarea"
        defaultValue="This is a pre-filled textarea with some sample content. It spans multiple lines to demonstrate the component height."
        rows={4}
      />
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <div className="w-80 space-y-1.5">
      <Label htmlFor="disabled-textarea">Read-only notes</Label>
      <Textarea
        id="disabled-textarea"
        placeholder="This textarea is disabled"
        disabled
        defaultValue="You cannot edit this content."
      />
    </div>
  ),
};

export const ErrorState: Story = {
  render: () => (
    <div className="w-80 space-y-1.5">
      <Label htmlFor="error-textarea">Message</Label>
      <Textarea
        id="error-textarea"
        placeholder="Enter your message..."
        className="border-destructive focus-visible:ring-destructive"
        defaultValue="Too short"
      />
      <p className="text-xs text-destructive">Message must be at least 20 characters long.</p>
    </div>
  ),
};

export const Resizable: Story = {
  render: () => (
    <div className="w-80 space-y-1.5">
      <Label htmlFor="resizable-textarea">Custom prompt</Label>
      <Textarea
        id="resizable-textarea"
        placeholder="This textarea grows with content..."
        rows={3}
      />
      <p className="text-xs text-muted-foreground">Drag the bottom-right corner to resize.</p>
    </div>
  ),
};
