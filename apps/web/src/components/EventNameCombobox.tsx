import { useState, useMemo } from 'react';
import { Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandInput,
  CommandList,
  CommandItem,
  CommandEmpty,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useEventDefinitions, buildDescriptionMap } from '@/hooks/use-event-definitions';
import translations from './EventNameCombobox.translations';

interface EventNameComboboxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function EventNameCombobox({
  value,
  onChange,
  placeholder = 'event_name',
  className: triggerClassName,
}: EventNameComboboxProps) {
  const { t } = useLocalTranslation(translations);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { data: definitions = [] } = useEventDefinitions();

  const descriptions = useMemo(() => buildDescriptionMap(definitions), [definitions]);
  const eventNames = useMemo(() => definitions.map((d) => d.event_name), [definitions]);

  const filtered = search
    ? eventNames.filter((n) => {
        const q = search.toLowerCase();
        const desc = descriptions[n];
        return n.toLowerCase().includes(q) || desc?.toLowerCase().includes(q);
      })
    : eventNames;

  const handleSelect = (name: string) => {
    onChange(name);
    setOpen(false);
    setSearch('');
  };

  const displayValue = value ? (descriptions[value] || value) : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex h-8 w-full items-center rounded-sm border border-input bg-input/30 px-2 text-left text-xs outline-none transition-colors hover:bg-input/50',
            !value && 'text-muted-foreground',
            descriptions[value] ? 'font-sans' : 'font-mono',
            triggerClassName,
          )}
        >
          <span className="flex-1 truncate">{displayValue}</span>
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-48 p-0" align="start" side="bottom">
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder={t('searchEvents')}
          />
          <CommandList>
            <CommandEmpty className="px-3 py-3 text-left">
              {search ? (
                <button
                  type="button"
                  className="w-full rounded-sm px-1 py-0.5 text-left text-sm transition-colors hover:bg-accent"
                  onClick={() => handleSelect(search)}
                >
                  Use <span className="font-mono font-medium">"{search}"</span>
                </button>
              ) : (
                <span className="text-xs text-muted-foreground">{t('noEventsFound')}</span>
              )}
            </CommandEmpty>

            {filtered.map((name) => (
              <CommandItem key={name} value={name} onSelect={() => handleSelect(name)}>
                <Check
                  className={cn('h-3.5 w-3.5 flex-shrink-0', value === name ? 'opacity-100' : 'opacity-0')}
                />
                <div className="min-w-0 flex-1">
                  {descriptions[name] ? (
                    <>
                      <span className="text-sm truncate block">{descriptions[name]}</span>
                      <span className="font-mono text-[11px] text-muted-foreground truncate block">{name}</span>
                    </>
                  ) : (
                    <span className="font-mono text-sm truncate block">{name}</span>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
