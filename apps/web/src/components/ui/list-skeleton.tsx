import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface ListSkeletonProps {
  count?: number;
  height?: string;
  className?: string;
}

export function ListSkeleton({ count = 3, height = 'h-16', className }: ListSkeletonProps) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={cn(height, 'w-full')} />
      ))}
    </div>
  );
}
