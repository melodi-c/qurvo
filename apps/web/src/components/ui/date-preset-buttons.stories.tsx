import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { DatePresetButtons } from './date-preset-buttons';
import { todayIso } from '@/lib/date-utils';

const meta: Meta<typeof DatePresetButtons> = {
  title: 'UI/DatePresetButtons',
  component: DatePresetButtons,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof DatePresetButtons>;

export const AllPresets: Story = {
  render: () => {
    const [dateFrom, setDateFrom] = useState('-30d');
    const [dateTo, setDateTo] = useState(todayIso());
    return (
      <div className="w-80 p-4">
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
    const [dateFrom, setDateFrom] = useState('-7d');
    const [dateTo, setDateTo] = useState(todayIso());
    return (
      <div className="w-80 p-4">
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
    <div className="w-80 p-4">
      <DatePresetButtons
        dateFrom="2025-01-01"
        dateTo="2025-01-15"
        onChange={() => {}}
      />
    </div>
  ),
};

export const MtdActive: Story = {
  render: () => {
    const [dateFrom, setDateFrom] = useState('mStart');
    const [dateTo, setDateTo] = useState(todayIso());
    return (
      <div className="w-80 p-4">
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
