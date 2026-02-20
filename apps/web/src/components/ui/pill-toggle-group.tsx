import { cn } from '@/lib/utils';

interface PillToggleGroupProps<T extends string> {
  options: readonly { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function PillToggleGroup<T extends string>({
  options,
  value,
  onChange,
  className,
}: PillToggleGroupProps<T>) {
  return (
    <div className={cn('flex gap-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
            value === o.value
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border bg-transparent text-muted-foreground hover:border-primary/40 hover:text-foreground'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
