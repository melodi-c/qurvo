import type { ReactNode } from 'react';

interface QueryPanelShellProps {
  children: ReactNode;
}

export function QueryPanelShell({ children }: QueryPanelShellProps) {
  return (
    <aside className="w-full lg:w-[360px] shrink-0 border-b border-border lg:border-b-0 lg:border-r overflow-y-auto lg:max-h-none">
      <div className="p-5 space-y-6">
        {children}
      </div>
    </aside>
  );
}
