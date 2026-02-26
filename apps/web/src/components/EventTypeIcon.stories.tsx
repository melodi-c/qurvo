import type { Meta, StoryObj } from '@storybook/react';
import { EventTypeIcon } from './EventTypeIcon';

const meta: Meta<typeof EventTypeIcon> = {
  title: 'Components/EventTypeIcon',
  component: EventTypeIcon,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof EventTypeIcon>;

export const Pageview: Story = {
  args: {
    eventName: '$pageview',
  },
};

export const Identify: Story = {
  args: {
    eventName: '$identify',
  },
};

export const Pageleave: Story = {
  args: {
    eventName: '$pageleave',
  },
};

export const Set: Story = {
  args: {
    eventName: '$set',
  },
};

export const Screen: Story = {
  args: {
    eventName: '$screen',
  },
};

export const Custom: Story = {
  args: {
    eventName: 'button_clicked',
  },
};

export const Unknown: Story = {
  args: {
    eventName: 'some_unknown_event_xyz',
  },
};

export const AllTypes: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {[
        { name: '$pageview', label: '$pageview' },
        { name: '$identify', label: '$identify' },
        { name: '$pageleave', label: '$pageleave' },
        { name: '$set', label: '$set' },
        { name: '$set_once', label: '$set_once' },
        { name: '$screen', label: '$screen' },
        { name: 'button_clicked', label: 'custom event' },
        { name: 'unknown_event', label: 'unknown event' },
      ].map(({ name, label }) => (
        <div key={name} className="flex items-center gap-2 text-sm">
          <EventTypeIcon eventName={name} />
          <span className="font-mono text-xs text-muted-foreground">{label}</span>
        </div>
      ))}
    </div>
  ),
};
