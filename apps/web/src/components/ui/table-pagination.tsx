import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface TablePaginationProps {
  page: number;
  onPageChange: (page: number) => void;
  hasMore: boolean;
  className?: string;
}

export function TablePagination({ page, onPageChange, hasMore, className }: TablePaginationProps) {
  return (
    <div className={cn('flex justify-between items-center px-4 py-3 border-t border-border', className)}>
      <Button variant="outline" size="sm" disabled={page === 0} onClick={() => onPageChange(page - 1)}>
        Previous
      </Button>
      <span className="text-xs text-muted-foreground">Page {page + 1}</span>
      <Button variant="outline" size="sm" disabled={!hasMore} onClick={() => onPageChange(page + 1)}>
        Next
      </Button>
    </div>
  );
}
