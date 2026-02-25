import type { FunnelStep } from '@/api/generated/Api';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './TimeToConvertStepSelector.translations';

interface TimeToConvertStepSelectorProps {
  steps: FunnelStep[];
  fromStep: number;
  toStep: number;
  onFromStepChange: (step: number) => void;
  onToStepChange: (step: number) => void;
}

export function TimeToConvertStepSelector({
  steps,
  fromStep,
  toStep,
  onFromStepChange,
  onToStepChange,
}: TimeToConvertStepSelectorProps) {
  const { t } = useLocalTranslation(translations);

  return (
    <div className="flex items-center gap-3 px-6 pb-4">
      <Select value={String(fromStep)} onValueChange={(v) => onFromStepChange(Number(v))}>
        <SelectTrigger size="sm">
          <SelectValue placeholder={t('fromStep')} />
        </SelectTrigger>
        <SelectContent>
          {steps.map((step, i) => (
            <SelectItem key={i} value={String(i)} disabled={i >= toStep}>
              {step.label || step.event_name || `${t('fromStep')} ${i + 1}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <span className="text-xs text-muted-foreground">&rarr;</span>

      <Select value={String(toStep)} onValueChange={(v) => onToStepChange(Number(v))}>
        <SelectTrigger size="sm">
          <SelectValue placeholder={t('toStep')} />
        </SelectTrigger>
        <SelectContent>
          {steps.map((step, i) => (
            <SelectItem key={i} value={String(i)} disabled={i <= fromStep}>
              {step.label || step.event_name || `${t('toStep')} ${i + 1}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
