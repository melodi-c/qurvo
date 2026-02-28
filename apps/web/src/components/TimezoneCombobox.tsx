import { useState, useMemo } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
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
import translations from './TimezoneCombobox.translations';

const ALL_TIMEZONES = Intl.supportedValuesOf('timeZone');

interface TimezoneComboboxProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export function TimezoneCombobox({
  value,
  onChange,
  disabled,
  className,
}: TimezoneComboboxProps) {
  const { t } = useLocalTranslation(translations);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return ALL_TIMEZONES;
    const q = search.toLowerCase();
    return ALL_TIMEZONES.filter((tz) => tz.toLowerCase().includes(q));
  }, [search]);

  const handleSelect = (tz: string) => {
    onChange(tz);
    setOpen(false);
    setSearch('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'border-input bg-input/30 hover:bg-input/50 flex h-9 w-48 items-center justify-between gap-2 rounded-md border px-3 text-left text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
        >
          <span className="flex-1 truncate">{value}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-64 p-0" align="start" side="bottom">
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder={t('searchTimezone')}
          />
          <CommandList>
            <CommandEmpty>{t('noTimezoneFound')}</CommandEmpty>

            {filtered.map((tz) => (
              <CommandItem key={tz} value={tz} onSelect={() => handleSelect(tz)}>
                <Check
                  className={cn('h-3.5 w-3.5 shrink-0', value === tz ? 'opacity-100' : 'opacity-0')}
                />
                <span className="truncate">{tz}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
