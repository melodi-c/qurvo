import type { ReactNode } from 'react';
import { Copy, X } from 'lucide-react';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import translations from './ConditionRowWrapper.translations';

interface ConditionRowWrapperProps {
  label: string;
  labelColor: string;
  tooltip?: string;
  onRemove: () => void;
  onDuplicate?: () => void;
  children: ReactNode;
}

export function ConditionRowWrapper({ label, labelColor, tooltip, onRemove, onDuplicate, children }: ConditionRowWrapperProps) {
  const { t } = useLocalTranslation(translations);

  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] font-semibold uppercase tracking-wider ${labelColor}`}>{label}</span>
          {tooltip && <InfoTooltip content={tooltip} />}
        </div>
        <div className="flex items-center">
          {onDuplicate && (
            <button
              type="button"
              onClick={onDuplicate}
              aria-label={t('duplicateCondition')}
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/50 hover:text-foreground"
            >
              <Copy className="h-3 w-3" />
            </button>
          )}
          <button
            type="button"
            onClick={onRemove}
            aria-label={t('removeCondition')}
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/50 hover:text-destructive"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}
