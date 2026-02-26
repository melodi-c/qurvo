import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { Calendar } from './calendar';

const meta: Meta<typeof Calendar> = {
  title: 'UI/Calendar',
  component: Calendar,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Calendar>;

export const Default: Story = {
  render: () => (
    <div className="border rounded-md w-fit">
      <Calendar mode="single" />
    </div>
  ),
};

export const WithSelected: Story = {
  render: () => {
    const [date, setDate] = useState<Date | undefined>(new Date());
    return (
      <div className="border rounded-md w-fit">
        <Calendar
          mode="single"
          selected={date}
          onSelect={setDate}
        />
      </div>
    );
  },
};

export const RangeSelection: Story = {
  render: () => {
    const [range, setRange] = useState<DateRange | undefined>({
      from: new Date(new Date().setDate(new Date().getDate() - 7)),
      to: new Date(),
    });
    return (
      <div className="border rounded-md w-fit">
        <Calendar
          mode="range"
          selected={range}
          onSelect={setRange}
        />
      </div>
    );
  },
};

export const WithDisabledDates: Story = {
  render: () => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    return (
      <div className="border rounded-md w-fit">
        <Calendar
          mode="single"
          disabled={{ after: today }}
          selected={today}
        />
      </div>
    );
  },
};
