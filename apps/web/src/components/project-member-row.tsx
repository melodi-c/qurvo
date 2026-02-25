import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ProjectMemberRowProps {
  avatar?: ReactNode;
  name: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function ProjectMemberRow({ avatar, name, subtitle, actions, className }: ProjectMemberRowProps) {
  return (
    <div className={cn('flex items-center justify-between px-6 py-3', className)}>
      <div className="flex items-center gap-3">
        {avatar}
        <div>
          <p className="text-sm font-medium">{name}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
