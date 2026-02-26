import type { Meta, StoryObj } from '@storybook/react';
import { Badge } from './badge';
import { DefinitionList, DefinitionListRow } from './definition-list';

const meta: Meta<typeof DefinitionList> = {
  title: 'UI/DefinitionList',
  component: DefinitionList,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof DefinitionList>;

export const FewRows: Story = {
  render: () => (
    <div className="max-w-md border border-border rounded-lg overflow-hidden">
      <DefinitionList>
        <DefinitionListRow label="Project ID">abc-123-xyz</DefinitionListRow>
        <DefinitionListRow label="Created">Jan 15, 2025</DefinitionListRow>
        <DefinitionListRow label="Status">
          <Badge variant="default">Active</Badge>
        </DefinitionListRow>
      </DefinitionList>
    </div>
  ),
};

export const ManyRows: Story = {
  render: () => (
    <div className="max-w-md border border-border rounded-lg overflow-hidden">
      <DefinitionList>
        <DefinitionListRow label="Project ID">abc-123-xyz</DefinitionListRow>
        <DefinitionListRow label="Name">Acme Analytics</DefinitionListRow>
        <DefinitionListRow label="Region">us-east-1</DefinitionListRow>
        <DefinitionListRow label="Plan">
          <Badge variant="secondary">Pro</Badge>
        </DefinitionListRow>
        <DefinitionListRow label="Monthly Events">1,248,320</DefinitionListRow>
        <DefinitionListRow label="Team Members">8</DefinitionListRow>
        <DefinitionListRow label="Created">Jan 15, 2025</DefinitionListRow>
        <DefinitionListRow label="Last Active">2 hours ago</DefinitionListRow>
        <DefinitionListRow label="Status">
          <Badge variant="default">Active</Badge>
        </DefinitionListRow>
      </DefinitionList>
    </div>
  ),
};

export const Grouped: Story = {
  render: () => (
    <div className="max-w-md flex flex-col gap-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70 px-6 pb-3">
          General
        </p>
        <div className="border border-border rounded-lg overflow-hidden">
          <DefinitionList>
            <DefinitionListRow label="Project ID">abc-123-xyz</DefinitionListRow>
            <DefinitionListRow label="Name">Acme Analytics</DefinitionListRow>
            <DefinitionListRow label="Region">us-east-1</DefinitionListRow>
          </DefinitionList>
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70 px-6 pb-3">
          Billing
        </p>
        <div className="border border-border rounded-lg overflow-hidden">
          <DefinitionList>
            <DefinitionListRow label="Plan">
              <Badge variant="secondary">Pro</Badge>
            </DefinitionListRow>
            <DefinitionListRow label="Monthly Events">1,248,320 / 2,000,000</DefinitionListRow>
            <DefinitionListRow label="Renewal">Mar 1, 2026</DefinitionListRow>
          </DefinitionList>
        </div>
      </div>
    </div>
  ),
};

export const WithMixedContent: Story = {
  render: () => (
    <div className="max-w-md border border-border rounded-lg overflow-hidden">
      <DefinitionList>
        <DefinitionListRow label="API Key">
          <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
            sk-prod-a1b2c3...
          </code>
        </DefinitionListRow>
        <DefinitionListRow label="Permissions">
          <div className="flex gap-1.5">
            <Badge variant="outline">read</Badge>
            <Badge variant="outline">write</Badge>
          </div>
        </DefinitionListRow>
        <DefinitionListRow label="Expires">Never</DefinitionListRow>
      </DefinitionList>
    </div>
  ),
};
