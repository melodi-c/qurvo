import { useMemo, useCallback } from 'react';
import { Plus, X, FunctionSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { STATUS_COLORS } from '@/lib/chart-colors';
import { validateFormula } from './formula-evaluator';
import { SERIES_LETTERS } from './trend-shared';
import translations from './FormulaBuilder.translations';
import type { TrendFormula } from '@/api/generated/Api';

interface FormulaBuilderProps {
  formulas: TrendFormula[];
  seriesCount: number;
  onChange: (formulas: TrendFormula[]) => void;
}

const ERROR_KEYS: Record<string, string> = {
  empty: 'errorEmpty',
  syntax: 'errorSyntax',
  unknownSeries: 'errorUnknownSeries',
  noSeries: 'errorNoSeries',
};

export function FormulaBuilder({ formulas, seriesCount, onChange }: FormulaBuilderProps) {
  const { t } = useLocalTranslation(translations);

  const availableLetters = useMemo(
    () => SERIES_LETTERS.slice(0, seriesCount),
    [seriesCount],
  );

  const addFormula = useCallback(() => {
    onChange([
      ...formulas,
      { id: crypto.randomUUID(), label: '', expression: '' },
    ]);
  }, [formulas, onChange]);

  const updateFormula = useCallback((idx: number, patch: Partial<TrendFormula>) => {
    onChange(formulas.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  }, [formulas, onChange]);

  const removeFormula = useCallback((idx: number) => {
    onChange(formulas.filter((_, i) => i !== idx));
  }, [formulas, onChange]);

  return (
    <div className="space-y-2">
      {formulas.map((formula, idx) => {
        const validation = formula.expression.trim()
          ? validateFormula(formula.expression, availableLetters)
          : null;
        const hasError = validation && !validation.valid;
        const errorKey = hasError ? ERROR_KEYS[(validation as { error: string }).error] : null;

        return (
          <div
            key={formula.id}
            className="rounded-lg border border-border bg-secondary/30 p-2.5 space-y-2"
          >
            <div className="flex items-center gap-2">
              <FunctionSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <Input
                value={formula.label}
                onChange={(e) => updateFormula(idx, { label: e.target.value })}
                placeholder={t('labelPlaceholder')}
                className="h-7 text-xs bg-transparent border-none shadow-none focus-visible:ring-0 px-1"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 shrink-0"
                onClick={() => removeFormula(idx)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground">{t('expression')}</span>
                <InfoTooltip content={t('expressionTooltip')} />
              </div>
              <Input
                value={formula.expression}
                onChange={(e) => updateFormula(idx, { expression: e.target.value })}
                placeholder={t('formulaPlaceholder')}
                className={`h-7 text-xs font-mono ${hasError ? 'border-red-500/60 focus-visible:ring-red-500/30' : ''}`}
              />
              {hasError && errorKey && (
                <p className={`text-[10px] ${STATUS_COLORS.negative}`}>{t(errorKey as keyof typeof translations['en'])}</p>
              )}
            </div>
          </div>
        );
      })}

      <Button
        variant="outline"
        size="sm"
        onClick={addFormula}
        className="w-full text-xs h-7"
      >
        <Plus className="h-3 w-3 mr-1" />
        {t('addFormula')}
      </Button>
    </div>
  );
}
