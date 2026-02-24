import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

interface EditorSkeletonProps {
  metricCount?: number;
  children?: ReactNode;
}

export function EditorSkeleton({ metricCount = 2, children }: EditorSkeletonProps) {
  return (
    <>
      <div className="flex gap-8">
        {Array.from({ length: metricCount }, (_, i) => (
          <Skeleton key={i} className="h-10 w-28" />
        ))}
      </div>
      {children ?? <Skeleton className="h-[300px] w-full" />}
    </>
  );
}
