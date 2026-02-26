import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { TablePagination } from './table-pagination';

const meta: Meta<typeof TablePagination> = {
  title: 'UI/TablePagination',
  component: TablePagination,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof TablePagination>;

export const FirstPage: Story = {
  render: () => {
    const [page, setPage] = useState(0);
    return (
      <div className="w-80 border rounded-lg">
        <TablePagination page={page} onPageChange={setPage} hasMore />
      </div>
    );
  },
};

export const MiddlePage: Story = {
  render: () => {
    const [page, setPage] = useState(3);
    return (
      <div className="w-80 border rounded-lg">
        <TablePagination page={page} onPageChange={setPage} hasMore />
      </div>
    );
  },
};

export const LastPage: Story = {
  render: () => {
    const [page, setPage] = useState(7);
    return (
      <div className="w-80 border rounded-lg">
        <TablePagination page={page} onPageChange={setPage} hasMore={false} />
      </div>
    );
  },
};
