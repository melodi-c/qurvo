import type { ElementType } from 'react';

export function SectionHeader({ icon: Icon, label }: { icon: ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
      <Icon className="h-3.5 w-3.5" />
      {label}
    </div>
  );
}
