import type { Meta, StoryObj } from '@storybook/react';
import { Settings } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
} from './popover';
import { Button } from './button';
import { Input } from './input';
import { Label } from './label';

const meta: Meta = {
  title: 'UI/Popover',
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">Open Popover</Button>
      </PopoverTrigger>
      <PopoverContent>
        <PopoverHeader>
          <PopoverTitle>Popover Title</PopoverTitle>
          <PopoverDescription>This is the popover description text.</PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  ),
};

export const WithSettings: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon">
          <Settings className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <PopoverHeader>
          <PopoverTitle>Display Settings</PopoverTitle>
          <PopoverDescription>Configure the display options.</PopoverDescription>
        </PopoverHeader>
        <div className="flex flex-col gap-3 mt-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="display-name">Display Name</Label>
            <Input id="display-name" placeholder="Enter name..." />
          </div>
          <Button size="sm" className="w-full">Save Settings</Button>
        </div>
      </PopoverContent>
    </Popover>
  ),
};

export const AsComboboxContainer: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-48 justify-between">
          Select event...
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-0">
        <div className="p-2 text-sm text-muted-foreground">
          This slot would contain a Command component for searchable selection (see Combobox pattern).
        </div>
      </PopoverContent>
    </Popover>
  ),
};
