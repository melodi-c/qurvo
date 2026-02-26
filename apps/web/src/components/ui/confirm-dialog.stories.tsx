import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './button';
import { ConfirmDialog } from './confirm-dialog';

const meta: Meta<typeof ConfirmDialog> = {
  title: 'UI/ConfirmDialog',
  component: ConfirmDialog,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['destructive', 'default'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof ConfirmDialog>;

export const Destructive: Story = {
  render: () => {
    const [open, setOpen] = useState(true);
    return (
      <>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          Delete item
        </Button>
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title="Delete project?"
          description="This action cannot be undone. All data associated with this project will be permanently removed."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          variant="destructive"
          onConfirm={() => {}}
        />
      </>
    );
  },
};

export const Default: Story = {
  render: () => {
    const [open, setOpen] = useState(true);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Confirm action</Button>
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title="Apply changes?"
          description="This will update the configuration for all team members."
          confirmLabel="Apply"
          cancelLabel="Cancel"
          variant="default"
          onConfirm={() => {}}
        />
      </>
    );
  },
};

export const WithPendingState: Story = {
  render: () => {
    const [open, setOpen] = useState(true);
    return (
      <>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          Delete with async
        </Button>
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title="Delete all events?"
          description="This will permanently delete all 12,483 events. This action cannot be undone."
          confirmLabel="Delete All"
          cancelLabel="Cancel"
          variant="destructive"
          onConfirm={() =>
            new Promise((resolve) => setTimeout(resolve, 3000))
          }
        />
      </>
    );
  },
};

export const WithoutDescription: Story = {
  render: () => {
    const [open, setOpen] = useState(true);
    return (
      <>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          Simple confirm
        </Button>
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title="Are you sure?"
          confirmLabel="Yes, proceed"
          cancelLabel="No, go back"
          variant="destructive"
          onConfirm={() => {}}
        />
      </>
    );
  },
};
