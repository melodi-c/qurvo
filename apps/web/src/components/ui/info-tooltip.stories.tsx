import type { Meta, StoryObj } from '@storybook/react';
import { InfoTooltip } from './info-tooltip';

const meta: Meta<typeof InfoTooltip> = {
  title: 'UI/InfoTooltip',
  component: InfoTooltip,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof InfoTooltip>;

export const Default: Story = {
  render: () => (
    <div className="flex items-center gap-2 p-8">
      <span className="text-sm">Unique users</span>
      <InfoTooltip content="The number of distinct users who performed this event." />
    </div>
  ),
};

export const WithLongText: Story = {
  render: () => (
    <div className="flex items-center gap-2 p-8">
      <span className="text-sm">Retention rate</span>
      <InfoTooltip content="The percentage of users who returned and performed the target event after their initial session. Calculated over the selected time window using a rolling 7-day cohort baseline." />
    </div>
  ),
};

export const InlineWithLabel: Story = {
  render: () => (
    <div className="flex flex-col gap-4 p-8">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
          Conversion Rate
        </span>
        <InfoTooltip content="Percentage of users who completed all steps in the funnel." />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
          Median Time
        </span>
        <InfoTooltip content="The median time taken by users to complete the entire funnel from first to last step." />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
          Drop-off
        </span>
        <InfoTooltip content="Users who started the funnel but did not complete the next step within the conversion window." />
      </div>
    </div>
  ),
};
