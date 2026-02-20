import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: ReactNode;
  children?: ReactNode;
}

export function PageHeader({ title, children }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      {typeof title === 'string' ? (
        <h1 className="text-base font-semibold">{title}</h1>
      ) : (
        title
      )}
      {children}
    </div>
  );
}
