import { useState } from 'react';
import { Check, Users } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandInput,
  CommandList,
  CommandItem,
  CommandEmpty,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { useCohorts } from '../hooks/use-cohorts';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './CohortSelector.translations';

interface CohortSelectorProps {
  value: string[];
  onChange: (value: string[]) => void;
}

export function CohortSelector({ value, onChange }: CohortSelectorProps) {
  const { t } = useLocalTranslation(translations);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { data: cohorts = [] } = useCohorts();

  const filtered = search
    ? cohorts.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : cohorts;

  const toggle = (id: string) => {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  };

  const selectedNames = cohorts
    .filter((c) => value.includes(c.id))
    .map((c) => c.name);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex h-8 w-full items-center rounded-md border border-input bg-input/30 px-3 text-left text-sm transition-colors hover:bg-input/50',
            !value.length && 'text-muted-foreground',
          )}
        >
          <Users className="h-3.5 w-3.5 mr-2 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate">
            {selectedNames.length > 0
              ? selectedNames.join(', ')
              : t('selectCohorts')}
          </span>
          {value.length > 0 && (
            <span className="ml-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary px-1">
              {value.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-52 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput value={search} onValueChange={setSearch} placeholder={t('searchCohorts')} />
          <CommandList>
            <CommandEmpty className="px-3 py-3 text-xs text-muted-foreground">
              {t('noCohorts')}
            </CommandEmpty>
            {filtered.map((cohort) => (
              <CommandItem key={cohort.id} value={cohort.id} onSelect={() => toggle(cohort.id)}>
                <Check
                  className={cn('h-3.5 w-3.5 shrink-0', value.includes(cohort.id) ? 'opacity-100' : 'opacity-0')}
                />
                <span className="text-sm truncate">{cohort.name}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
