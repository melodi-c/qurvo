import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

export interface StatRowItem {
  label: string;
  value: string | number | ReactNode;
  valueClassName?: string;
}

interface StatRowProps {
  items: StatRowItem[];
  className?: string;
}

/**
 * A horizontal row of labelled stat items.
 * Each item renders a muted label above a semibold value.
 *
 * Usage:
 *   <StatRow items={[
 *     { label: 'Winner', value: 'Segment A' },
 *     { label: 'Diff', value: '+12.3%', valueClassName: 'text-emerald-400' },
 *   ]} />
 */
export function StatRow({ items, className }: StatRowProps) {
  return (
    <div className={cn('flex items-start gap-6 text-sm', className)}>
      {items.map((item, index) => (
        <div key={index}>
          <div className="text-muted-foreground">{item.label}</div>
          <div className={cn('font-semibold text-foreground', item.valueClassName)}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}
