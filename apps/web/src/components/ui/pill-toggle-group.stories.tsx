import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { PillToggleGroup } from './pill-toggle-group';

const meta: Meta<typeof PillToggleGroup> = {
  title: 'UI/PillToggleGroup',
  component: PillToggleGroup,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof PillToggleGroup>;

const chartTypeOptions = [
  { label: 'Line', value: 'line' },
  { label: 'Bar', value: 'bar' },
] as const;

const matchModeOptions = [
  { label: 'Any', value: 'any' },
  { label: 'All', value: 'all' },
  { label: 'Exact', value: 'exact' },
] as const;

export const TwoOptions: Story = {
  render: () => {
    const [value, setValue] = useState<'line' | 'bar'>('line');
    return (
      <div className="w-40">
        <PillToggleGroup
          options={chartTypeOptions}
          value={value}
          onChange={setValue}
        />
      </div>
    );
  },
};

export const ThreeOptions: Story = {
  render: () => {
    const [value, setValue] = useState<'any' | 'all' | 'exact'>('any');
    return (
      <div className="w-56">
        <PillToggleGroup
          options={matchModeOptions}
          value={value}
          onChange={setValue}
        />
      </div>
    );
  },
};

export const AllSelected: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      {chartTypeOptions.map((opt) => (
        <div key={opt.value} className="w-40">
          <PillToggleGroup
            options={chartTypeOptions}
            value={opt.value}
            onChange={() => {}}
          />
        </div>
      ))}
    </div>
  ),
};
