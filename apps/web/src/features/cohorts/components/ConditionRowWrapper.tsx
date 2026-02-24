import type { ReactNode } from 'react';
import { X } from 'lucide-react';

interface ConditionRowWrapperProps {
  label: string;
  labelColor: string;
  onRemove: () => void;
  children: ReactNode;
}

export function ConditionRowWrapper({ label, labelColor, onRemove, children }: ConditionRowWrapperProps) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${labelColor}`}>{label}</span>
        <button
          type="button"
          onClick={onRemove}
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/50 hover:text-destructive"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      {children}
    </div>
  );
}
