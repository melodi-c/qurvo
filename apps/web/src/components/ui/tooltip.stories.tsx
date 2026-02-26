import type { Meta, StoryObj } from '@storybook/react';
import { Info, HelpCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';
import { Button } from './button';

// TooltipProvider is mounted globally in Storybook preview decorator

const meta: Meta = {
  title: 'UI/Tooltip',
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <div className="flex items-center justify-center p-8">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon">
            <Info className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>More information</TooltipContent>
      </Tooltip>
    </div>
  ),
};

export const WithLongText: Story = {
  render: () => (
    <div className="flex items-center justify-center p-8">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="sm">
            <HelpCircle className="size-4" />
            Help
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          This is a tooltip with a longer description that wraps across multiple lines when the content exceeds the available width.
        </TooltipContent>
      </Tooltip>
    </div>
  ),
};

export const OnText: Story = {
  render: () => (
    <div className="flex items-center gap-4 p-8">
      <Tooltip>
        <TooltipTrigger>
          <span className="underline decoration-dotted cursor-help text-muted-foreground text-sm">
            Unique users
          </span>
        </TooltipTrigger>
        <TooltipContent>
          Count of distinct persons who triggered the event
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger>
          <span className="underline decoration-dotted cursor-help text-muted-foreground text-sm">
            p99 latency
          </span>
        </TooltipTrigger>
        <TooltipContent>
          99th percentile latency across all requests
        </TooltipContent>
      </Tooltip>
    </div>
  ),
};
