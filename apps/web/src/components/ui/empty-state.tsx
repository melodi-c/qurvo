import type { ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: ElementType;
  title?: string;
  description: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 text-center py-16', className)}>
      {title ? (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Icon className="h-6 w-6 text-muted-foreground" />
        </div>
      ) : (
        <Icon className="h-8 w-8 text-muted-foreground" />
      )}
      <div>
        {title && <p className="text-sm font-medium">{title}</p>}
        <p className={cn('text-sm text-muted-foreground', title && 'mt-1')}>{description}</p>
      </div>
      {action}
    </div>
  );
}
