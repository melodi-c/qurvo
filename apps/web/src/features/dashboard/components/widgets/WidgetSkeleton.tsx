import { Skeleton } from '@/components/ui/skeleton';

type SkeletonVariant = 'chart' | 'table' | 'flow';

interface WidgetSkeletonProps {
  variant?: SkeletonVariant;
}

function ChartSkeleton() {
  return (
    <div className="h-full flex flex-col p-3 gap-2">
      {/* Metric header */}
      <div className="flex items-center gap-3 pb-2">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-3 w-14" />
      </div>
      {/* Chart bars */}
      <div className="flex-1 flex items-end gap-1.5 min-h-0">
        {[60, 80, 45, 90, 70, 55, 85, 40, 75, 65].map((h, i) => (
          <Skeleton key={i} className="flex-1 rounded-sm" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="h-full flex flex-col p-3 gap-2">
      {/* Metric header */}
      <div className="flex items-center gap-3 pb-2">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-3 w-14" />
      </div>
      {/* Table rows */}
      <div className="flex-1 flex flex-col gap-1.5 min-h-0">
        <div className="flex gap-2">
          <Skeleton className="h-4 w-20" />
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-4 flex-1" />
          ))}
        </div>
        {[1, 2, 3, 4].map((row) => (
          <div key={row} className="flex gap-2">
            <Skeleton className="h-4 w-20" />
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function FlowSkeleton() {
  return (
    <div className="h-full flex flex-col p-3 gap-2">
      {/* Metric header */}
      <div className="flex items-center gap-3 pb-2">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-3 w-14" />
      </div>
      {/* Flow nodes */}
      <div className="flex-1 flex items-center justify-center gap-4 min-h-0">
        {[1, 2, 3].map((col) => (
          <div key={col} className="flex flex-col gap-2 items-center">
            <Skeleton className="h-10 w-24 rounded-lg" />
            <Skeleton className="h-10 w-20 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function WidgetSkeleton({ variant = 'chart' }: WidgetSkeletonProps) {
  switch (variant) {
    case 'table':
      return <TableSkeleton />;
    case 'flow':
      return <FlowSkeleton />;
    default:
      return <ChartSkeleton />;
  }
}
