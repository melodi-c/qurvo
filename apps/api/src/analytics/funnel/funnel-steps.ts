import {
  col,
  and,
  eq,
  namedParam,
  inArray,
  type Expr,
} from '@qurvo/ch-query';
import { propertyFilters } from '../query-helpers';
import type { FunnelStep, FunnelExclusion } from './funnel.types';

// ── Step helpers ─────────────────────────────────────────────────────────────

/** Returns all event names for a step (supports OR-logic via event_names). */
export function resolveStepEventNames(step: FunnelStep): string[] {
  if (step.event_names?.length) {return step.event_names;}
  return [step.event_name];
}

/**
 * Builds the windowFunnel condition for one step as an Expr AST node.
 *
 * Uses `namedParam()` to embed step event names directly in the AST — the compiler
 * extracts parameters automatically, eliminating manual queryParams mutation.
 */
export function buildStepCondition(
  step: FunnelStep,
  idx: number,
): Expr {
  const names = resolveStepEventNames(step);
  const eventCond: Expr = names.length === 1
    ? eq(col('event_name'), namedParam(`step_${idx}`, 'String', names[0]))
    : inArray(col('event_name'), namedParam(`step_${idx}_names`, 'Array(String)', names));

  const filtersExpr = propertyFilters(step.filters ?? []);
  if (!filtersExpr) {return eventCond;}

  return and(eventCond, filtersExpr);
}

/** Collects all unique event names across steps and exclusions. */
export function buildAllEventNames(steps: FunnelStep[], exclusions: FunnelExclusion[] = []): string[] {
  const names = new Set<string>();
  for (const s of steps) {
    for (const n of resolveStepEventNames(s)) {names.add(n);}
  }
  for (const e of exclusions) {names.add(e.event_name);}
  return Array.from(names);
}
