import { Fragment, type KeyboardEvent, type ReactNode } from 'react';
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
  expandedRowKey?: string;
  onExpandToggle?: (key: string) => void;
  renderExpandedRow?: (row: T) => ReactNode;
  emptyState?: ReactNode;
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
  expandedRowKey,
  onExpandToggle,
  renderExpandedRow,
  emptyState,
}: DataTableProps<T>) {
  const hasPagination = page !== undefined && onPageChange !== undefined;
  const isExpandable = onExpandToggle !== undefined && renderExpandedRow !== undefined;
  const isClickable = !!onRowClick || isExpandable;

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
          {data.map((row) => {
            const key = rowKey(row);
            const isExpanded = isExpandable && expandedRowKey === key;

            return (
              <Fragment key={key}>
                <tr
                  className={cn(
                    'transition-colors',
                    isClickable && 'cursor-pointer',
                    isClickable && 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                    isExpanded ? 'bg-muted/30 hover:bg-muted/30' : 'hover:bg-muted/20',
                  )}
                  tabIndex={isClickable ? 0 : undefined}
                  onClick={
                    onRowClick
                      ? () => onRowClick(row)
                      : isExpandable
                        ? () => onExpandToggle(key)
                        : undefined
                  }
                  onKeyDown={
                    isClickable
                      ? (e: KeyboardEvent<HTMLTableRowElement>) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (onRowClick) onRowClick(row);
                            else if (isExpandable) onExpandToggle(key);
                          }
                        }
                      : undefined
                  }
                >
                  {columns.map((col) => (
                    <td key={col.key} className={cn('px-4 py-3', col.className, col.hideOnMobile && 'hidden lg:table-cell')}>
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
                {isExpanded && (
                  <tr className="border-t-0">
                    <td colSpan={columns.length} className="p-0">
                      {renderExpandedRow(row)}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
          {data.length === 0 && emptyState && (
            <tr>
              <td colSpan={columns.length} className="p-0">
                {emptyState}
              </td>
            </tr>
          )}
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
