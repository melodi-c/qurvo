import { cn } from '@/lib/utils';

interface TabNavItem<T extends string> {
  readonly id: T;
  readonly label: string;
}

interface TabNavProps<T extends string> {
  tabs: readonly TabNavItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function TabNav<T extends string>({ tabs, value, onChange, className }: TabNavProps<T>) {
  return (
    <div role="tablist" className={cn('flex gap-1 border-b border-border', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={value === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            'relative px-3 py-2 text-sm font-medium transition-colors -mb-px',
            value === tab.id
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {tab.label}
          {value === tab.id && (
            <span className="absolute inset-x-0 bottom-0 h-0.5 bg-white" />
          )}
        </button>
      ))}
    </div>
  );
}
