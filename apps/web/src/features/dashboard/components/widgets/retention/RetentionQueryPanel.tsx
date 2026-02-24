import { useMemo } from 'react';
import { CalendarCheck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { PillToggleGroup } from '@/components/ui/pill-toggle-group';
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
    { value: 'first_time', label: t('firstTime') },
    { value: 'recurring', label: t('recurring') },
  ], [t]);

  return (
    <TargetEventQueryPanel
      config={config}
      onChange={onChange}
      eventIcon={CalendarCheck}
      extraDisplayContent={
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">{t('retentionType')}</span>
          <PillToggleGroup
            options={retentionTypeOptions}
            value={config.retention_type}
            onChange={(v) => onChange({ ...config, retention_type: v as RetentionWidgetConfig['retention_type'] })}
          />
        </div>
      }
      granularityAdjacentContent={
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">{t('periods')}</span>
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
