import { useMemo, useCallback } from 'react';
import { Plus, X, Copy, GripVertical, FunctionSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useDragReorder } from '@/hooks/use-drag-reorder';
import { STATUS_COLORS, CHART_FORMULA_COLORS_HSL } from '@/lib/chart-colors';
import { cn } from '@/lib/utils';
import { validateFormula } from './formula-evaluator';
import { SERIES_LETTERS } from './trend-shared';
import translations from './FormulaBuilder.translations';
import type { TrendFormula } from '@/api/generated/Api';

interface FormulaBuilderProps {
  formulas: TrendFormula[];
  seriesCount: number;
  onChange: (formulasOrUpdater: TrendFormula[] | ((prev: TrendFormula[]) => TrendFormula[])) => void;
}

const ERROR_KEYS: Record<string, string> = {
  empty: 'errorEmpty',
  syntax: 'errorSyntax',
  unknownSeries: 'errorUnknownSeries',
  noSeries: 'errorNoSeries',
};

export function FormulaBuilder({ formulas, seriesCount, onChange }: FormulaBuilderProps) {
  const { t } = useLocalTranslation(translations);
  const drag = useDragReorder(formulas, onChange);

  const availableLetters = useMemo(
    () => SERIES_LETTERS.slice(0, seriesCount),
    [seriesCount],
  );

  const addFormula = useCallback(() => {
    onChange((prev) => [
      ...prev,
      { id: crypto.randomUUID(), label: '', expression: '' },
    ]);
  }, [onChange]);

  const updateFormula = useCallback((idx: number, patch: Partial<TrendFormula>) => {
    onChange((prev) => prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  }, [onChange]);

  const duplicateFormula = useCallback((idx: number) => {
    onChange((prev) => {
      const original = prev[idx];
      const copy: TrendFormula = {
        id: crypto.randomUUID(),
        label: `${original.label || ''} ${t('copyLabel')}`.trim(),
        expression: original.expression,
      };
      return [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
    });
  }, [onChange, t]);

  const removeFormula = useCallback((idx: number) => {
    onChange((prev) => prev.filter((_, i) => i !== idx));
  }, [onChange]);

  return (
    <div className="space-y-2">
      {formulas.map((formula, idx) => {
        const validation = formula.expression.trim()
          ? validateFormula(formula.expression, availableLetters)
          : null;
        const hasError = validation && !validation.valid;
        const errorKey = hasError ? ERROR_KEYS[(validation as { error: string }).error] : null;
        const formulaColor = CHART_FORMULA_COLORS_HSL[idx % CHART_FORMULA_COLORS_HSL.length];

        return (
          <div
            key={formula.id}
            className={cn(
              'rounded-lg border transition-colors',
              drag.overIdx === idx && drag.dragIdx !== null && drag.dragIdx !== idx
                ? 'border-primary/50 bg-primary/5'
                : 'border-border/70 bg-muted/20',
            )}
            draggable
            onDragStart={(e) => drag.handleDragStart(idx, e)}
            onDragEnd={drag.handleDragEnd}
            onDragOver={(e) => drag.handleDragOver(idx, e)}
            onDragLeave={() => drag.handleDragLeave(idx)}
          >
            {/* Header: grip + colored badge + label + actions */}
            <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border/40">
              <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 cursor-grab active:cursor-grabbing" />
              <div className="flex items-center gap-1.5 shrink-0">
                <div
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: formulaColor }}
                />
                <FunctionSquare className="h-3 w-3 text-muted-foreground" />
              </div>
              <div className="flex items-center flex-1 min-w-0 rounded-sm border border-border/60 bg-muted/30">
                <Input
                  value={formula.label}
                  onChange={(e) => updateFormula(idx, { label: e.target.value })}
                  placeholder={t('labelPlaceholder')}
                  className="h-7 flex-1 min-w-0 border-0 bg-transparent text-xs font-medium shadow-none px-2 focus-visible:ring-0"
                />
                <button
                  type="button"
                  onClick={() => duplicateFormula(idx)}
                  aria-label={t('duplicateFormula')}
                  className="flex h-7 w-7 shrink-0 items-center justify-center text-muted-foreground/50 transition-colors hover:text-foreground"
                >
                  <Copy className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => removeFormula(idx)}
                  aria-label={t('removeFormula')}
                  className="flex h-7 w-7 shrink-0 items-center justify-center text-muted-foreground/50 transition-colors hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* Expression input */}
            <div className="px-2 py-1.5 space-y-1">
              <div className="flex items-center gap-1">
                <span className="text-[10px] uppercase font-semibold text-muted-foreground/60">{t('expression')}</span>
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
