import { useState } from 'react';
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
import translations from './PropertyNameCombobox.translations';

interface PropertyNameComboboxProps {
  value: string;
  onChange: (value: string) => void;
  propertyNames: string[];
  className?: string;
}

export function PropertyNameCombobox({
  value,
  onChange,
  propertyNames,
  className,
}: PropertyNameComboboxProps) {
  const { t } = useLocalTranslation(translations);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = search
    ? propertyNames.filter((n) => n.toLowerCase().includes(search.toLowerCase()))
    : propertyNames;

  const handleSelect = (name: string) => {
    onChange(name);
    setOpen(false);
    setSearch('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex w-full items-center rounded-sm border border-input bg-input/30 px-2 text-left font-mono text-xs outline-none transition-colors hover:bg-input/50',
            !value && 'text-muted-foreground',
            className,
          )}
        >
          <span className="flex-1 truncate">{value || t('searchProperties')}</span>
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-40 p-0" align="start" side="bottom">
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder={t('searchProperties')}
          />
          <CommandList>
            <CommandEmpty className="px-3 py-3 text-left">
              <span className="text-xs text-muted-foreground">{t('noPropertiesFound')}</span>
            </CommandEmpty>

            {filtered.map((name) => (
              <CommandItem key={name} value={name} onSelect={() => handleSelect(name)}>
                <Check
                  className={cn('h-3.5 w-3.5 flex-shrink-0', value === name ? 'opacity-100' : 'opacity-0')}
                />
                <span className="font-mono text-xs truncate">{name}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
