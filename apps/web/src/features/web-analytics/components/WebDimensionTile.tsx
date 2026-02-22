import { useState } from 'react';
import type { WebAnalyticsDimensionRow } from '@/api/generated/Api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TabNav } from '@/components/ui/tab-nav';
import { Skeleton } from '@/components/ui/skeleton';

interface TabConfig<T extends string> {
  readonly id: T;
  readonly label: string;
}

interface WebDimensionTileProps<T extends string> {
  title: string;
  tabs: readonly TabConfig<T>[];
  data: Record<T, WebAnalyticsDimensionRow[] | undefined>;
  isLoading: boolean;
}

export function WebDimensionTile<T extends string>({
  title,
  tabs,
  data,
  isLoading,
}: WebDimensionTileProps<T>) {
  const [activeTab, setActiveTab] = useState<T>(tabs[0].id);
  const rows = data[activeTab] ?? [];

  const maxVisitors = rows.length > 0 ? Math.max(...rows.map((r) => r.visitors)) : 1;

  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <TabNav tabs={tabs} value={activeTab} onChange={setActiveTab} className="px-6" />
      <CardContent className="pt-3">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 rounded" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No data</p>
        ) : (
          <div className="space-y-1">
            <div className="flex items-center text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wide px-2 pb-1">
              <span className="flex-1">Name</span>
              <span className="w-16 text-right">Visitors</span>
              <span className="w-16 text-right">Views</span>
            </div>
            {rows.map((row) => (
              <div key={row.name} className="relative flex items-center gap-2 rounded-md px-2 py-1.5 text-sm">
                <div
                  className="absolute inset-y-0 left-0 rounded-md bg-primary/5"
                  style={{ width: `${(row.visitors / maxVisitors) * 100}%` }}
                />
                <span className="relative flex-1 truncate text-foreground/80">{row.name}</span>
                <span className="relative w-16 text-right tabular-nums text-foreground/70">
                  {row.visitors.toLocaleString()}
                </span>
                <span className="relative w-16 text-right tabular-nums text-muted-foreground">
                  {row.pageviews.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
