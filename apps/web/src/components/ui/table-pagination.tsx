import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './table-pagination.translations';

interface TablePaginationProps {
  page: number;
  onPageChange: (page: number) => void;
  hasMore: boolean;
  className?: string;
}

export function TablePagination({ page, onPageChange, hasMore, className }: TablePaginationProps) {
  const { t } = useLocalTranslation(translations);
  return (
    <div className={cn('flex justify-between items-center px-4 py-3 border-t border-border', className)}>
      <Button variant="outline" size="sm" disabled={page === 0} onClick={() => onPageChange(page - 1)}>
        {t('previous')}
      </Button>
      <span className="text-xs text-muted-foreground">{t('page', { page: String(page + 1) })}</span>
      <Button variant="outline" size="sm" disabled={!hasMore} onClick={() => onPageChange(page + 1)}>
        {t('next')}
      </Button>
    </div>
  );
}
