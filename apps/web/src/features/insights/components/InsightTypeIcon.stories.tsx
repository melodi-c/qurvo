import type { Meta, StoryObj } from '@storybook/react';
import { InsightTypeIcon } from './InsightTypeIcon';
import type { InsightType } from '@/api/generated/Api';

const meta: Meta<typeof InsightTypeIcon> = {
  title: 'Insights/InsightTypeIcon',
  component: InsightTypeIcon,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof InsightTypeIcon>;

export const Trend: Story = {
  args: { type: 'trend' as InsightType },
};

export const Funnel: Story = {
  args: { type: 'funnel' as InsightType },
};

export const Retention: Story = {
  args: { type: 'retention' as InsightType },
};

export const Lifecycle: Story = {
  args: { type: 'lifecycle' as InsightType },
};

export const Stickiness: Story = {
  args: { type: 'stickiness' as InsightType },
};

export const Paths: Story = {
  args: { type: 'paths' as InsightType },
};

export const AllTypes: Story = {
  name: 'AllTypes — all insight types',
  render: () => (
    <div className="flex items-center gap-4 flex-wrap">
      {(['trend', 'funnel', 'retention', 'lifecycle', 'stickiness', 'paths'] as InsightType[]).map(
        (type) => (
          <div key={type} className="flex items-center gap-2">
            <InsightTypeIcon type={type} />
            <span className="text-sm text-muted-foreground">{type}</span>
          </div>
        ),
      )}
    </div>
  ),
};

export const Large: Story = {
  name: 'Large — custom size',
  render: () => (
    <div className="flex items-center gap-4 flex-wrap">
      {(['trend', 'funnel', 'retention', 'lifecycle', 'stickiness', 'paths'] as InsightType[]).map(
        (type) => (
          <InsightTypeIcon key={type} type={type} className="h-6 w-6" />
        ),
      )}
    </div>
  ),
};
