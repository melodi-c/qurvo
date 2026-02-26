import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { TabNav } from './tab-nav';

const meta: Meta<typeof TabNav> = {
  title: 'UI/TabNav',
  component: TabNav,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof TabNav>;

const settingsTabs = [
  { id: 'general', label: 'General' },
  { id: 'members', label: 'Members' },
  { id: 'api', label: 'API' },
] as const;

const eventTabs = [
  { id: 'event', label: 'Event Properties' },
  { id: 'person', label: 'Person Properties' },
] as const;

export const Settings: Story = {
  render: () => {
    const [tab, setTab] = useState<'general' | 'members' | 'api'>('general');
    return (
      <TabNav
        tabs={settingsTabs}
        value={tab}
        onChange={setTab}
      />
    );
  },
};

export const TwoTabs: Story = {
  render: () => {
    const [tab, setTab] = useState<'event' | 'person'>('event');
    return (
      <TabNav
        tabs={eventTabs}
        value={tab}
        onChange={setTab}
      />
    );
  },
};

export const ActiveFirst: Story = {
  render: () => (
    <TabNav
      tabs={settingsTabs}
      value="general"
      onChange={() => {}}
    />
  ),
};

export const ActiveLast: Story = {
  render: () => (
    <TabNav
      tabs={settingsTabs}
      value="api"
      onChange={() => {}}
    />
  ),
};
