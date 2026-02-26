import type { Meta, StoryObj } from '@storybook/react';
import { ChevronDown } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from './collapsible';
import { Button } from './button';

const meta: Meta = {
  title: 'UI/Collapsible',
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj;

export const Collapsed: Story = {
  render: () => (
    <Collapsible className="w-72">
      <div className="flex items-center justify-between px-3 py-2 border rounded-md">
        <span className="text-sm font-medium">Advanced Options</span>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="icon-sm">
            <ChevronDown className="size-4" />
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="mt-2 px-3 py-2 border rounded-md text-sm text-muted-foreground">
        These are the advanced settings that are hidden by default.
      </CollapsibleContent>
    </Collapsible>
  ),
};

export const Expanded: Story = {
  render: () => (
    <Collapsible defaultOpen className="w-72">
      <div className="flex items-center justify-between px-3 py-2 border rounded-md">
        <span className="text-sm font-medium">Filter Options</span>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="icon-sm">
            <ChevronDown className="size-4" />
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="mt-2 flex flex-col gap-2">
        <div className="px-3 py-2 border rounded-md text-sm">Filter by country</div>
        <div className="px-3 py-2 border rounded-md text-sm">Filter by device type</div>
        <div className="px-3 py-2 border rounded-md text-sm">Filter by referrer</div>
      </CollapsibleContent>
    </Collapsible>
  ),
};

export const NestedContent: Story = {
  render: () => (
    <div className="flex flex-col gap-3 w-72">
      <Collapsible defaultOpen>
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase font-medium text-muted-foreground">Events</span>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="icon-sm">
              <ChevronDown className="size-3.5" />
            </Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent className="mt-2 flex flex-col gap-1">
          <div className="text-sm py-1 px-2 rounded hover:bg-accent cursor-pointer">$pageview</div>
          <div className="text-sm py-1 px-2 rounded hover:bg-accent cursor-pointer">$identify</div>
          <div className="text-sm py-1 px-2 rounded hover:bg-accent cursor-pointer">button_click</div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  ),
};
