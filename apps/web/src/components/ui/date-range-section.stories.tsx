import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { DateRangeSection } from './date-range-section';
import { daysAgoIso, todayIso } from '@/lib/date-utils';

const meta: Meta<typeof DateRangeSection> = {
  title: 'UI/DateRangeSection',
  component: DateRangeSection,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof DateRangeSection>;

export const Default: Story = {
  render: () => {
    const [dateFrom, setDateFrom] = useState(daysAgoIso(30));
    const [dateTo, setDateTo] = useState(todayIso());
    return (
      <div className="w-72 p-4">
        <DateRangeSection
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

export const PresetSelected: Story = {
  render: () => {
    const [dateFrom, setDateFrom] = useState(daysAgoIso(7));
    const [dateTo, setDateTo] = useState(todayIso());
    return (
      <div className="w-72 p-4">
        <DateRangeSection
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

export const CustomRange: Story = {
  render: () => {
    const [dateFrom, setDateFrom] = useState('2025-01-01');
    const [dateTo, setDateTo] = useState('2025-01-31');
    return (
      <div className="w-72 p-4">
        <DateRangeSection
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
