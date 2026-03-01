import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { QueryPanelShell } from './query-panel-shell';
import { DateRangeSection } from './date-range-section';
import { Separator } from './separator';
import { SectionHeader } from './section-header';
import { todayIso } from '@/lib/date-utils';
import { BarChart2, Filter } from 'lucide-react';
import { Input } from './input';

const meta: Meta<typeof QueryPanelShell> = {
  title: 'UI/QueryPanelShell',
  component: QueryPanelShell,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof QueryPanelShell>;

export const WithDateRange: Story = {
  render: () => {
    const [dateFrom, setDateFrom] = useState('-30d');
    const [dateTo, setDateTo] = useState(todayIso());

    return (
      <div className="h-[600px] flex border rounded-lg overflow-hidden">
        <QueryPanelShell>
          <DateRangeSection
            dateFrom={dateFrom}
            dateTo={dateTo}
            onChange={(from, to) => {
              setDateFrom(from);
              setDateTo(to);
            }}
          />
        </QueryPanelShell>
        <div className="flex-1 p-6 text-sm text-muted-foreground">Chart area</div>
      </div>
    );
  },
};

export const WithDateRangeAndSeparator: Story = {
  render: () => {
    const [dateFrom, setDateFrom] = useState('-7d');
    const [dateTo, setDateTo] = useState(todayIso());
    const [eventName, setEventName] = useState('');

    return (
      <div className="h-[600px] flex border rounded-lg overflow-hidden">
        <QueryPanelShell>
          <DateRangeSection
            dateFrom={dateFrom}
            dateTo={dateTo}
            onChange={(from, to) => {
              setDateFrom(from);
              setDateTo(to);
            }}
          />
          <Separator />
          <section className="space-y-3">
            <SectionHeader icon={BarChart2} label="Target Event" />
            <Input
              placeholder="Event name..."
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
            />
          </section>
        </QueryPanelShell>
        <div className="flex-1 p-6 text-sm text-muted-foreground">Chart area</div>
      </div>
    );
  },
};

export const MultipleSections: Story = {
  render: () => {
    const [dateFrom, setDateFrom] = useState('-30d');
    const [dateTo, setDateTo] = useState(todayIso());

    return (
      <div className="h-[700px] flex border rounded-lg overflow-hidden">
        <QueryPanelShell>
          <DateRangeSection
            dateFrom={dateFrom}
            dateTo={dateTo}
            onChange={(from, to) => {
              setDateFrom(from);
              setDateTo(to);
            }}
          />
          <Separator />
          <section className="space-y-3">
            <SectionHeader icon={BarChart2} label="Events" />
            <Input placeholder="Add event..." />
          </section>
          <Separator />
          <section className="space-y-3">
            <SectionHeader icon={Filter} label="Filters" />
            <p className="text-xs text-muted-foreground">No filters applied.</p>
          </section>
        </QueryPanelShell>
        <div className="flex-1 p-6 text-sm text-muted-foreground">Chart area</div>
      </div>
    );
  },
};
