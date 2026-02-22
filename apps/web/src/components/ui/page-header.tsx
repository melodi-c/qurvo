import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: ReactNode;
  children?: ReactNode;
}

export function PageHeader({ title, children }: PageHeaderProps) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        {typeof title === 'string' ? (
          <h1 className="text-base font-semibold truncate">{title}</h1>
        ) : (
          title
        )}
      </div>
      {children && <div className="flex-shrink-0">{children}</div>}
    </div>
  );
}
