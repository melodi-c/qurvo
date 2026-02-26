import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Users } from 'lucide-react';
import { Badge } from './badge';
import { DataTable, type Column } from './data-table';
import { EmptyState } from './empty-state';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status: 'active' | 'inactive';
}

const sampleUsers: User[] = [
  { id: '1', name: 'Alice Johnson', email: 'alice@example.com', role: 'Admin', status: 'active' },
  { id: '2', name: 'Bob Smith', email: 'bob@example.com', role: 'Member', status: 'active' },
  { id: '3', name: 'Carol Davis', email: 'carol@example.com', role: 'Member', status: 'inactive' },
  { id: '4', name: 'Dave Wilson', email: 'dave@example.com', role: 'Viewer', status: 'active' },
  { id: '5', name: 'Eve Martinez', email: 'eve@example.com', role: 'Member', status: 'active' },
];

const columns: Column<User>[] = [
  {
    key: 'name',
    header: 'Name',
    render: (row) => <span className="font-medium">{row.name}</span>,
  },
  {
    key: 'email',
    header: 'Email',
    render: (row) => <span className="text-muted-foreground">{row.email}</span>,
  },
  {
    key: 'role',
    header: 'Role',
    render: (row) => <Badge variant="secondary">{row.role}</Badge>,
  },
  {
    key: 'status',
    header: 'Status',
    render: (row) => (
      <Badge variant={row.status === 'active' ? 'default' : 'outline'}>
        {row.status}
      </Badge>
    ),
  },
];

const meta: Meta<typeof DataTable> = {
  title: 'UI/DataTable',
  component: DataTable,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof DataTable>;

export const WithData: Story = {
  render: () => (
    <DataTable
      columns={columns}
      data={sampleUsers}
      rowKey={(row) => row.id}
    />
  ),
};

export const Clickable: Story = {
  render: () => (
    <DataTable
      columns={columns}
      data={sampleUsers}
      rowKey={(row) => row.id}
      onRowClick={(row) => alert(`Clicked: ${row.name}`)}
    />
  ),
};

export const Empty: Story = {
  render: () => (
    <DataTable
      columns={columns}
      data={[]}
      rowKey={(row) => row.id}
      emptyState={
        <EmptyState
          icon={Users}
          description="No users found."
          className="py-8"
        />
      }
    />
  ),
};

export const WithPagination: Story = {
  render: () => {
    const [page, setPage] = useState(1);
    const pageSize = 3;
    const start = (page - 1) * pageSize;
    const pageData = sampleUsers.slice(start, start + pageSize);
    const hasMore = start + pageSize < sampleUsers.length;

    return (
      <DataTable
        columns={columns}
        data={pageData}
        rowKey={(row) => row.id}
        page={page}
        onPageChange={setPage}
        hasMore={hasMore}
      />
    );
  },
};
