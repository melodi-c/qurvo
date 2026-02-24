import { useCallback, useMemo } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EventNameCombobox } from '@/components/EventNameCombobox';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './FunnelExclusionBuilder.translations';

export interface ExclusionEntry {
  event_name: string;
  funnel_from_step: number;
  funnel_to_step: number;
}

interface FunnelExclusionBuilderProps {
  exclusions: ExclusionEntry[];
  onChange: (exclusions: ExclusionEntry[]) => void;
  stepCount: number;
}

export function FunnelExclusionBuilder({ exclusions, onChange, stepCount }: FunnelExclusionBuilderProps) {
  const { t } = useLocalTranslation(translations);

  const stepOptions = useMemo(() => {
    return Array.from({ length: stepCount }, (_, i) => ({
      value: String(i),
      label: String(i + 1),
    }));
  }, [stepCount]);

  const handleAdd = useCallback(() => {
    onChange([...exclusions, { event_name: '', funnel_from_step: 0, funnel_to_step: Math.min(1, stepCount - 1) }]);
  }, [exclusions, onChange, stepCount]);

  const handleRemove = useCallback((index: number) => {
    onChange(exclusions.filter((_, i) => i !== index));
  }, [exclusions, onChange]);

  const handleUpdate = useCallback((index: number, patch: Partial<ExclusionEntry>) => {
    onChange(exclusions.map((e, i) => i === index ? { ...e, ...patch } : e));
  }, [exclusions, onChange]);

  return (
    <div className="space-y-2">
      {exclusions.map((ex, i) => (
        <div key={i} className="space-y-1.5 rounded-md border border-border/50 p-2">
          <div className="flex items-center gap-1">
            <EventNameCombobox
              value={ex.event_name}
              onChange={(event_name) => handleUpdate(i, { event_name })}
              className="flex-1"
            />
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => handleRemove(i)}
              aria-label={t('remove')}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>{t('between')}</span>
            <Select
              value={String(ex.funnel_from_step)}
              onValueChange={(v) => handleUpdate(i, { funnel_from_step: Number(v) })}
            >
              <SelectTrigger size="sm" className="w-12 h-6 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {stepOptions.slice(0, -1).map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>{t('and')}</span>
            <Select
              value={String(ex.funnel_to_step)}
              onValueChange={(v) => handleUpdate(i, { funnel_to_step: Number(v) })}
            >
              <SelectTrigger size="sm" className="w-12 h-6 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {stepOptions.slice(1).map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      ))}

      <Button variant="ghost" size="xs" onClick={handleAdd} className="w-full text-xs">
        + {t('addExclusion')}
      </Button>
    </div>
  );
}
