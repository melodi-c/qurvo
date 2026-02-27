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
  const windowSecondsPk = `coh_${condIdx}_window_seconds`;

  ctx.queryParams[daysPk] = cond.time_window_days;
  ctx.queryParams[windowSecondsPk] = cond.time_window_days * 86400;

  // Each pair of consecutive steps is constrained to occur within time_window_days
  // using ClickHouse's (?t<=N) time constraint syntax. This ensures the inter-step
  // gap is bounded, not just the overall scan horizon defined by the WHERE clause.
  const patternParts = cond.steps.map((_, i) => `(?${i + 1})`);
  const pattern = patternParts.join(`(?t<={${windowSecondsPk}:UInt64})`);

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
