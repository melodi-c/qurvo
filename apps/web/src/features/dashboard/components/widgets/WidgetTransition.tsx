import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface WidgetTransitionProps {
  isFetching?: boolean;
  children: ReactNode;
}

export function WidgetTransition({ isFetching, children }: WidgetTransitionProps) {
  return (
    <div
      className={cn(
        'h-full animate-in fade-in duration-300',
        isFetching && 'opacity-60 transition-opacity',
      )}
    >
      {children}
    </div>
  );
}
