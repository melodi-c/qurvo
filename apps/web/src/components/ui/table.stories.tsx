import type { Meta, StoryObj } from '@storybook/react';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from './table';
import { Badge } from './badge';

const meta: Meta = {
  title: 'UI/Table',
  tags: ['autodocs'],
};

export default meta;

const INVOICES = [
  { id: 'INV-001', method: 'Credit Card', status: 'Paid', amount: '$250.00' },
  { id: 'INV-002', method: 'PayPal', status: 'Pending', amount: '$150.00' },
  { id: 'INV-003', method: 'Bank Transfer', status: 'Failed', amount: '$350.00' },
  { id: 'INV-004', method: 'Credit Card', status: 'Paid', amount: '$450.00' },
];

function statusVariant(status: string) {
  if (status === 'Paid') return 'default' as const;
  if (status === 'Failed') return 'destructive' as const;
  return 'secondary' as const;
}

export const Default: StoryObj = {
  render: () => (
    <div className="w-[600px]">
      <Table>
        <TableCaption>A list of recent invoices.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Invoice</TableHead>
            <TableHead>Payment Method</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {INVOICES.map((inv) => (
            <TableRow key={inv.id}>
              <TableCell className="font-medium">{inv.id}</TableCell>
              <TableCell>{inv.method}</TableCell>
              <TableCell>
                <Badge variant={statusVariant(inv.status)}>{inv.status}</Badge>
              </TableCell>
              <TableCell className="text-right">{inv.amount}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={3}>Total</TableCell>
            <TableCell className="text-right">$1,200.00</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  ),
};

export const Simple: StoryObj = {
  render: () => (
    <div className="w-[500px]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Events</TableHead>
            <TableHead>Last Seen</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[
            { name: 'Alice', events: 142, lastSeen: '2 hours ago' },
            { name: 'Bob', events: 89, lastSeen: '1 day ago' },
            { name: 'Carol', events: 214, lastSeen: '5 minutes ago' },
          ].map((row) => (
            <TableRow key={row.name}>
              <TableCell>{row.name}</TableCell>
              <TableCell>{row.events}</TableCell>
              <TableCell className="text-muted-foreground">{row.lastSeen}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  ),
};

export const Empty: StoryObj = {
  render: () => (
    <div className="w-[500px]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell colSpan={2} className="text-center text-muted-foreground py-8">
              No data available
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  ),
};
