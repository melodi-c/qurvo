import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { AnnotationDialog } from './annotation-dialog';
import { Button } from './button';
import type { Annotation, CreateAnnotation } from '@/api/generated/Api';

const meta: Meta = {
  title: 'UI/AnnotationDialog',
  tags: ['autodocs'],
};

export default meta;

const MOCK_ANNOTATION: Annotation = {
  id: 'ann-1',
  project_id: 'proj-1',
  created_by: 'user-1',
  date: '2026-02-15',
  label: 'Deploy v2.0',
  description: 'Major release with new dashboard features.',
  color: '#3b82f6',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const Create: StoryObj = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Add Annotation</Button>
        <AnnotationDialog
          open={open}
          onOpenChange={setOpen}
          initialDate="2026-02-20"
          onSave={async (data: CreateAnnotation) => {
            console.log('Saved annotation:', data);
          }}
        />
      </>
    );
  },
};

export const Edit: StoryObj = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button variant="outline" onClick={() => setOpen(true)}>Edit Annotation</Button>
        <AnnotationDialog
          open={open}
          onOpenChange={setOpen}
          annotation={MOCK_ANNOTATION}
          onSave={async (data: CreateAnnotation) => {
            console.log('Updated annotation:', data);
          }}
        />
      </>
    );
  },
};

export const SavingState: StoryObj = {
  render: () => {
    const [open, setOpen] = useState(true);
    return (
      <>
        <Button variant="outline" onClick={() => setOpen(true)}>Open (Saving State)</Button>
        <AnnotationDialog
          open={open}
          onOpenChange={setOpen}
          initialDate="2026-02-20"
          onSave={() =>
            new Promise((resolve) => {
              setTimeout(resolve, 60_000);
            })
          }
        />
      </>
    );
  },
};

export const OpenByDefault: StoryObj = {
  render: () => {
    const [open, setOpen] = useState(true);
    return (
      <AnnotationDialog
        open={open}
        onOpenChange={setOpen}
        initialDate="2026-02-20"
        onSave={async (data: CreateAnnotation) => {
          console.log('Saved:', data);
          setOpen(false);
        }}
      />
    );
  },
};
