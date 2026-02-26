import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { DatePresetButtons } from './date-preset-buttons';
import { daysAgoIso, todayIso } from '@/lib/date-utils';

const meta: Meta<typeof DatePresetButtons> = {
  title: 'UI/DatePresetButtons',
  component: DatePresetButtons,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof DatePresetButtons>;

export const AllPresets: Story = {
  render: () => {
    const [dateFrom, setDateFrom] = useState(daysAgoIso(30));
    const [dateTo, setDateTo] = useState(todayIso());
    return (
      <div className="w-72 p-4">
        <DatePresetButtons
          dateFrom={dateFrom}
          dateTo={dateTo}
          onChange={(from, to) => {
            setDateFrom(from);
            setDateTo(to);
          }}
        />
      </div>
    );
  },
};

export const ActivePreset: Story = {
  render: () => {
    const [dateFrom, setDateFrom] = useState(daysAgoIso(7));
    const [dateTo, setDateTo] = useState(todayIso());
    return (
      <div className="w-72 p-4">
        <DatePresetButtons
          dateFrom={dateFrom}
          dateTo={dateTo}
          onChange={(from, to) => {
            setDateFrom(from);
            setDateTo(to);
          }}
        />
      </div>
    );
  },
};

export const NoActivePreset: Story = {
  render: () => (
    <div className="w-72 p-4">
      <DatePresetButtons
        dateFrom="2025-01-01"
        dateTo="2025-01-15"
        onChange={() => {}}
      />
    </div>
  ),
};
