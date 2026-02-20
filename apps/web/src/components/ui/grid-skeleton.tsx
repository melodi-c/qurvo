import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface GridSkeletonProps {
  count?: number;
  height?: string;
  className?: string;
}

export function GridSkeleton({ count = 3, height = 'h-24', className }: GridSkeletonProps) {
  return (
    <div className={cn('grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={cn(height, 'rounded-xl')} />
      ))}
    </div>
  );
}
