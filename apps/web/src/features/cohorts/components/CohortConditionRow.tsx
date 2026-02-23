import { useState, useMemo } from 'react';
import { X, Check, Users } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { useCohorts } from '../hooks/use-cohorts';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './CohortConditionRow.translations';
import type { CohortRefCondition } from '../types';

interface CohortConditionRowProps {
  condition: CohortRefCondition;
  onChange: (condition: CohortRefCondition) => void;
  onRemove: () => void;
  excludeCohortId?: string;
}

export function CohortConditionRow({ condition, onChange, onRemove, excludeCohortId }: CohortConditionRowProps) {
  const { t } = useLocalTranslation(translations);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { data: cohorts = [] } = useCohorts();

  const available = useMemo(
    () => cohorts.filter((c) => c.id !== excludeCohortId),
    [cohorts, excludeCohortId],
  );

  const filtered = search
    ? available.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : available;

  const selectedName = cohorts.find((c) => c.id === condition.cohort_id)?.name;

  const operators = useMemo(() => [
    { value: 'false', label: t('inCohort') },
    { value: 'true', label: t('notInCohort') },
  ] as const, [t]);

  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-purple-400">{t('cohortMembership')}</span>
        <button
          type="button"
          onClick={onRemove}
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/50 hover:text-destructive"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      <Select
        value={String(condition.negated)}
        onValueChange={(v) => onChange({ ...condition, negated: v === 'true' })}
      >
        <SelectTrigger size="sm" className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {operators.map((op) => (
            <SelectItem key={op.value} value={op.value} className="text-xs">{op.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex h-8 w-full items-center rounded-md border border-input bg-input/30 px-3 text-left text-xs transition-colors hover:bg-input/50',
              !condition.cohort_id && 'text-muted-foreground',
            )}
          >
            <Users className="h-3.5 w-3.5 mr-2 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate">{selectedName ?? t('selectCohort')}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-52 p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput value={search} onValueChange={setSearch} placeholder={t('searchCohort')} />
            <CommandList>
              <CommandEmpty className="px-3 py-3 text-xs text-muted-foreground">{t('noCohorts')}</CommandEmpty>
              {filtered.map((cohort) => (
                <CommandItem
                  key={cohort.id}
                  value={cohort.id}
                  onSelect={() => { onChange({ ...condition, cohort_id: cohort.id }); setOpen(false); }}
                >
                  <Check className={cn('h-3.5 w-3.5 shrink-0', condition.cohort_id === cohort.id ? 'opacity-100' : 'opacity-0')} />
                  <span className="text-sm truncate">{cohort.name}</span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
