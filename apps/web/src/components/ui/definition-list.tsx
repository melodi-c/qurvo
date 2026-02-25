import type { ReactNode } from 'react';

export function DefinitionList({ children }: { children: ReactNode }) {
  return <dl className="divide-y divide-border text-sm">{children}</dl>;
}

export function DefinitionListRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-6 py-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
