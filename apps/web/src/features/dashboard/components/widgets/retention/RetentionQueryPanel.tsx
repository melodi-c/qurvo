import { useMemo } from 'react';
import { CalendarCheck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { TargetEventQueryPanel } from '../shared/TargetEventQueryPanel';
import translations from './RetentionQueryPanel.translations';
import type { RetentionWidgetConfig } from '@/api/generated/Api';

interface RetentionQueryPanelProps {
  config: RetentionWidgetConfig;
  onChange: (config: RetentionWidgetConfig) => void;
}

export function RetentionQueryPanel({ config, onChange }: RetentionQueryPanelProps) {
  const { t } = useLocalTranslation(translations);

  const retentionTypeOptions = useMemo(() => [
    { value: 'first_time', label: t('firstTime'), desc: t('firstTimeDesc') },
    { value: 'recurring', label: t('recurring'), desc: t('recurringDesc') },
  ], [t]);

  return (
    <TargetEventQueryPanel
      config={config}
      onChange={onChange}
      eventIcon={CalendarCheck}
      extraDisplayContent={
        <div className="space-y-1">
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">{t('retentionType')}</span>
            <InfoTooltip content={t('retentionTypeTooltip')} />
          </div>
          <Select
            value={config.retention_type}
            onValueChange={(v) => onChange({ ...config, retention_type: v as RetentionWidgetConfig['retention_type'] })}
          >
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {retentionTypeOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  <div className="flex flex-col">
                    <span>{o.label}</span>
                    <span className="text-xs text-muted-foreground">{o.desc}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      }
      granularityAdjacentContent={
        <div className="space-y-1">
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">{t('periods')}</span>
            <InfoTooltip content={t('periodsTooltip')} />
          </div>
          <Input
            type="number"
            min={1}
            max={30}
            value={config.periods}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (v >= 1 && v <= 30) onChange({ ...config, periods: v });
            }}
            className="h-8 text-sm"
          />
        </div>
      }
    />
  );
}
