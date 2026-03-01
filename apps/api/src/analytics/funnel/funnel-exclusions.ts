import {
  select,
  col,
  and,
  or,
  gte,
  gt,
  eq,
  lte,
  lt,
  add,
  literal,
  namedParam,
  inArray,
  not,
  groupArrayIf,
  toUnixTimestamp64Milli,
  toInt64,
  mul,
  lambda,
  arrayExists,
  type Expr,
  type SelectNode,
} from '@qurvo/ch-query';
import { propertyFilters } from '../query-helpers';
import { AppBadRequestException } from '../../exceptions/app-bad-request.exception';
import type { FunnelStep, FunnelExclusion } from './funnel.types';
import { resolveStepEventNames } from './funnel-steps';
import type { FunnelChQueryParams } from './funnel-params';

// ── Exclusion helpers ────────────────────────────────────────────────────────

export function validateExclusions(
  exclusions: FunnelExclusion[],
  numSteps: number,
  steps?: FunnelStep[],
): void {
  for (const excl of exclusions) {
    if (excl.funnel_from_step >= excl.funnel_to_step) {
      throw new AppBadRequestException(
        `Exclusion "${excl.event_name}": funnel_from_step must be < funnel_to_step`,
      );
    }
    if (excl.funnel_to_step >= numSteps) {
      throw new AppBadRequestException(
        `Exclusion "${excl.event_name}": funnel_to_step ${excl.funnel_to_step} out of range (max ${numSteps - 1})`,
      );
    }
    if (steps) {
      for (const step of steps) {
        const stepNames = resolveStepEventNames(step);
        if (stepNames.includes(excl.event_name) && !excl.filters?.length) {
          throw new AppBadRequestException(
            `Exclusion "${excl.event_name}" shares the same event name with a funnel step but has no ` +
            `property filters to distinguish them. Add property filters to the exclusion to avoid ` +
            `false exclusions, or use a different event name.`,
          );
        }
      }
    }
  }
}

/**
 * Builds per-user array columns for exclusion checking as Expr AST nodes.
 *
 * Returns an array of aliased Expr nodes:
 *   groupArrayIf(toUnixTimestamp64Milli(timestamp), fromCond) AS excl_0_from_arr
 *   groupArrayIf(toUnixTimestamp64Milli(timestamp), toCond) AS excl_0_to_arr
 *   groupArrayIf(toUnixTimestamp64Milli(timestamp), exclCond) AS excl_0_arr
 */
export function buildExclusionColumns(
  exclusions: FunnelExclusion[],
  steps: FunnelStep[],
): Expr[] {
  const exprs: Expr[] = [];
  for (const [i, excl] of exclusions.entries()) {
    const fromNames = resolveStepEventNames(steps[excl.funnel_from_step]);
    const toNames = resolveStepEventNames(steps[excl.funnel_to_step]);

    const fromCond: Expr = fromNames.length === 1
      ? eq(col('event_name'), namedParam(`excl_${i}_from_step_name`, 'String', fromNames[0]))
      : inArray(col('event_name'), namedParam(`excl_${i}_from_step_names`, 'Array(String)', fromNames));

    const toCond: Expr = toNames.length === 1
      ? eq(col('event_name'), namedParam(`excl_${i}_to_step_name`, 'String', toNames[0]))
      : inArray(col('event_name'), namedParam(`excl_${i}_to_step_names`, 'Array(String)', toNames));

    const exclFiltersExpr = propertyFilters(excl.filters ?? []);
    const exclCond: Expr = exclFiltersExpr
      ? and(eq(col('event_name'), namedParam(`excl_${i}_name`, 'String', excl.event_name)), exclFiltersExpr)
      : eq(col('event_name'), namedParam(`excl_${i}_name`, 'String', excl.event_name));

    const tsExpr = toUnixTimestamp64Milli(col('timestamp'));
    exprs.push(
      groupArrayIf(tsExpr, fromCond).as(`excl_${i}_from_arr`),
      groupArrayIf(tsExpr, toCond).as(`excl_${i}_to_arr`),
      groupArrayIf(tsExpr, exclCond).as(`excl_${i}_arr`),
    );
  }
  return exprs;
}

/**
 * Builds the excluded_users WHERE condition as an Expr AST node.
 *
 * A user is placed in excluded_users if, for exclusion i:
 *  - There exists at least one (from_ts, to_ts) conversion window attempt
 *    that is "tainted" by an exclusion event (excl_ts in (from_ts, to_ts))
 *  - AND there does NOT exist any "clean" (from_ts, to_ts) pair without an
 *    exclusion event in between
 *
 * @param anchorFilter - When true, restricts (f, t) pairs to only those where
 *   f is within [first_step_ms, first_step_ms + window]. Required for unordered
 *   funnels (issue #497).
 */
function buildExcludedUsersWhereExpr(
  exclusions: FunnelExclusion[],
  anchorFilter: boolean,
  queryParams: FunnelChQueryParams,
): Expr {
  const winMs = mul(toInt64(namedParam('window', 'UInt64', queryParams.window)), literal(1000));

  const perExclusion = exclusions.map((_, i) => {
    // Inner-most check: excl event exists between f and t
    const exclBetween = arrayExists(
      lambda(['e'], and(gt(col('e'), col('f')), lt(col('e'), col('t')))),
      col(`excl_${i}_arr`),
    );

    // To-step window check: t > f AND t <= f + win
    const toWindowCond = and(
      gt(col('t'), col('f')),
      lte(col('t'), add(col('f'), winMs)),
    );

    // Tainted inner: arrayExists(t -> toWindowCond AND exclBetween, excl_i_to_arr)
    const taintedInner = arrayExists(
      lambda(['t'], and(toWindowCond, exclBetween)),
      col(`excl_${i}_to_arr`),
    );

    // Clean inner: arrayExists(t -> toWindowCond AND NOT exclBetween, excl_i_to_arr)
    const cleanInner = arrayExists(
      lambda(['t'], and(toWindowCond, not(exclBetween))),
      col(`excl_${i}_to_arr`),
    );

    // Anchor guard: f >= first_step_ms AND f <= first_step_ms + win
    const anchorGuardExpr = anchorFilter
      ? and(gte(col('f'), col('first_step_ms')), lte(col('f'), add(col('first_step_ms'), winMs)))
      : undefined;

    // Tainted outer: arrayExists(f -> [anchorGuard AND] taintedInner = 1, excl_i_from_arr) = 1
    const taintedBody = anchorGuardExpr ? and(anchorGuardExpr, eq(taintedInner, literal(1))) : eq(taintedInner, literal(1));
    const tainted = eq(
      arrayExists(lambda(['f'], taintedBody), col(`excl_${i}_from_arr`)),
      literal(1),
    );

    // Clean outer: arrayExists(f -> [anchorGuard AND] cleanInner = 1, excl_i_from_arr) = 0
    const cleanBody = anchorGuardExpr ? and(anchorGuardExpr, eq(cleanInner, literal(1))) : eq(cleanInner, literal(1));
    const clean = eq(
      arrayExists(lambda(['f'], cleanBody), col(`excl_${i}_from_arr`)),
      literal(0),
    );

    return and(tainted, clean);
  });

  return perExclusion.length === 1 ? perExclusion[0] : or(...perExclusion);
}

/** Builds the excluded_users CTE as a QueryNode (AST). */
export function buildExcludedUsersCTE(
  exclusions: FunnelExclusion[],
  anchorFilter: boolean,
  queryParams: FunnelChQueryParams,
): SelectNode {
  return select(col('person_id'))
    .from('funnel_per_user')
    .where(buildExcludedUsersWhereExpr(exclusions, anchorFilter, queryParams))
    .build();
}

/**
 * Extracts alias names from an array of Expr nodes (typically exclusion columns).
 * Each node is expected to be an AliasExpr with a string alias field.
 */
export function extractExclColumnAliases(exprs: Expr[]): string[] {
  return exprs
    .map(e => (e as { type: string; alias?: string }).type === 'alias' ? (e as { alias: string }).alias : undefined)
    .filter((a): a is string => !!a);
}
