import type { Meta, StoryObj } from '@storybook/react';
import { Calculator, Calendar, Smile, User } from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from './command';

const meta: Meta = {
  title: 'UI/Command',
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj;

export const WithSearch: Story = {
  render: () => (
    <div className="w-72 border rounded-md overflow-hidden">
      <Command>
        <CommandInput placeholder="Search commands..." />
        <CommandList>
          <CommandItem>Profile</CommandItem>
          <CommandItem>Settings</CommandItem>
          <CommandItem>Dashboard</CommandItem>
          <CommandItem>Projects</CommandItem>
        </CommandList>
      </Command>
    </div>
  ),
};

export const Empty: Story = {
  render: () => (
    <div className="w-72 border rounded-md overflow-hidden">
      <Command>
        <CommandInput placeholder="Search for something rare..." defaultValue="xyznotfound" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandItem>This item does not match the query</CommandItem>
        </CommandList>
      </Command>
    </div>
  ),
};

export const WithGroups: Story = {
  render: () => (
    <div className="w-72 border rounded-md overflow-hidden">
      <Command>
        <CommandInput placeholder="Type a command..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Suggestions">
            <CommandItem>
              <Calendar />
              Calendar
            </CommandItem>
            <CommandItem>
              <Smile />
              Emoji
            </CommandItem>
            <CommandItem>
              <Calculator />
              Calculator
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Settings">
            <CommandItem>
              <User />
              Profile
            </CommandItem>
            <CommandItem>
              <Calculator />
              Billing
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  ),
};

export const StandaloneNoInput: Story = {
  render: () => (
    <div className="w-64 border rounded-md overflow-hidden">
      <Command>
        <CommandList>
          <CommandGroup heading="Actions">
            <CommandItem>Copy</CommandItem>
            <CommandItem>Paste</CommandItem>
            <CommandItem>Cut</CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  ),
};
