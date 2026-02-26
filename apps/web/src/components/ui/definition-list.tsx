import type { ReactNode } from 'react';

export function DefinitionList({ children }: { children: ReactNode }) {
  return <dl className="divide-y divide-border text-sm">{children}</dl>;
}

export function DefinitionListRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-6 py-3">
      <dt className="text-muted-foreground flex items-center gap-1">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
