import { Input } from '@/components/ui/input';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './TimeWindowInput.translations';

interface TimeWindowInputProps {
  value: number;
  onChange: (value: number) => void;
  label?: string;
}

export function TimeWindowInput({ value, onChange, label }: TimeWindowInputProps) {
  const { t } = useLocalTranslation(translations);

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground whitespace-nowrap">{label ?? t('inLast')}</span>
      <Input
        type="number"
        min={1}
        max={365}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-8 text-xs w-20"
      />
      <span className="text-xs text-muted-foreground">{t('days')}</span>
    </div>
  );
}
