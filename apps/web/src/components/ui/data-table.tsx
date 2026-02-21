import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { TablePagination } from '@/components/ui/table-pagination';

export interface Column<T> {
  key: string;
  header: string;
  className?: string;
  headerClassName?: string;
  hideOnMobile?: boolean;
  render: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  className?: string;
  page?: number;
  onPageChange?: (page: number) => void;
  hasMore?: boolean;
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  onRowClick,
  className,
  page,
  onPageChange,
  hasMore,
}: DataTableProps<T>) {
  const hasPagination = page !== undefined && onPageChange !== undefined;

  return (
    <div className={cn('rounded-lg border border-border overflow-hidden', className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/30 text-xs text-muted-foreground">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  'text-left px-4 py-2.5 font-medium',
                  col.headerClassName,
                  col.hideOnMobile && 'hidden lg:table-cell',
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.map((row) => (
            <tr
              key={rowKey(row)}
              className={`hover:bg-muted/20 transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((col) => (
                <td key={col.key} className={cn('px-4 py-3', col.className, col.hideOnMobile && 'hidden lg:table-cell')}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {hasPagination && (
        <TablePagination
          page={page}
          onPageChange={onPageChange}
          hasMore={hasMore ?? false}
          className="bg-muted/10"
        />
      )}
    </div>
  );
}
