import type { CohortEventFilter } from '@qurvo/db';
import { buildEventFilterClauses } from '../helpers';
import type { BuildContext } from '../types';

interface SequenceCondition {
  steps: { event_name: string; event_filters?: CohortEventFilter[] }[];
  time_window_days: number;
}

export function buildSequenceCore(
  cond: SequenceCondition,
  ctx: BuildContext,
): { pattern: string; stepConditions: string[]; daysPk: string } {
  const condIdx = ctx.counter.value++;
  const daysPk = `coh_${condIdx}_days`;

  ctx.queryParams[daysPk] = cond.time_window_days;

  const patternParts = cond.steps.map((_, i) => `(?${i + 1})`);
  const pattern = patternParts.join('.*');

  const stepConditions = cond.steps.map((step, i) => {
    const stepEventPk = `coh_${condIdx}_seq_${i}`;
    ctx.queryParams[stepEventPk] = step.event_name;

    let filterExpr = `event_name = {${stepEventPk}:String}`;
    if (step.event_filters && step.event_filters.length > 0) {
      filterExpr += buildEventFilterClauses(step.event_filters, `coh_${condIdx}_s${i}`, ctx.queryParams);
    }
    return filterExpr;
  });

  return { pattern, stepConditions, daysPk };
}
