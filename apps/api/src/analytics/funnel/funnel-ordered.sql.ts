import type { CompilerContext} from '@qurvo/ch-query';
import { compileExprToSql, rawWithParams, select, raw, type Expr, type QueryNode } from '@qurvo/ch-query';
import type { FunnelStep, FunnelExclusion } from './funnel.types';
import {
  RESOLVED_PERSON,
  buildWindowFunnelExpr,
  buildExclusionColumns,
  buildExcludedUsersCTE,
  buildStepCondition,
  buildStrictUserFilter,
  funnelTsExprSql,
  compileExprsToSqlColumns,
  type FunnelChQueryParams,
} from './funnel-sql-shared';

export interface OrderedCTEOptions {
  steps: FunnelStep[];
  orderType: 'ordered' | 'strict';
  stepConditions: Expr[];
  exclusions: FunnelExclusion[];
  cohortClause: string;
  samplingClause: string;
  numSteps: number;
  queryParams: FunnelChQueryParams;
  breakdownExpr?: string;
  includeTimestampCols?: boolean;
  /** Shared CompilerContext to avoid p_N param collisions across multiple compileExprToSql calls. */
  ctx?: CompilerContext;
}

/**
 * Return type for the ordered/strict funnel CTE builder.
 * Each CTE is a named QueryNode, composable via SelectBuilder.withAll().
 */
export interface OrderedCTEResult {
  /** Named CTEs in dependency order (funnel_raw?, funnel_per_user, excluded_users?) */
  ctes: Array<{ name: string; query: QueryNode }>;
  /** Whether exclusions are active — caller uses this to build WHERE clause */
  hasExclusions: boolean;
}

/**
 * Builds the ordered/strict funnel CTEs using windowFunnel().
 *
 * Returns an array of named QueryNode CTEs that the caller attaches via .withAll().
 * CTE bodies are built as raw SQL via rawWithParams() — windowFunnel(), arrayFilter(),
 * and groupArrayIf() have no typed builder equivalents.
 */
export function buildOrderedFunnelCTEs(options: OrderedCTEOptions): OrderedCTEResult {
  const {
    steps, orderType, stepConditions, exclusions, cohortClause,
    samplingClause, numSteps, queryParams, breakdownExpr, includeTimestampCols, ctx,
  } = options;

  // Compile the windowFunnel Expr to SQL string for embedding in raw CTE body
  const wfExprAst = buildWindowFunnelExpr(orderType, stepConditions);
  const wfExpr = compileExprToSql(wfExprAst, queryParams, ctx).sql;
  const fromExpr = funnelTsExprSql('from', queryParams, ctx);
  const toExpr = funnelTsExprSql('to', queryParams, ctx);

  // Ordered mode: filter to only funnel-relevant events (step + exclusion names) for efficiency.
  // Strict mode: windowFunnel('strict_order') resets progress on any intervening event that
  // doesn't match the current or next expected step. So it must see ALL events for correctness.
  // However, we still pre-filter to users who have at least one funnel step event.
  const eventNameFilter = buildStrictUserFilter(fromExpr, toExpr, 'all_event_names', orderType);

  // Compile step 0 and last step conditions to SQL for use in raw CTE body
  const step0Cond = compileExprToSql(buildStepCondition(steps[0], 0), queryParams, ctx).sql;
  const lastStepCond = compileExprToSql(buildStepCondition(steps[numSteps - 1], numSteps - 1), queryParams, ctx).sql;

  // Optional breakdown column.
  const breakdownCol = breakdownExpr
    ? `,\n              ${orderType === 'strict' ? 'argMaxIf' : 'argMinIf'}(${breakdownExpr}, timestamp, ${step0Cond}) AS breakdown_value`
    : '';

  // Exclusion columns — compile Expr[] to SQL strings for raw CTE body
  const exclExprList = exclusions.length > 0
    ? buildExclusionColumns(exclusions, steps)
    : [];
  const exclColumnsSql = exclExprList.length > 0
    ? compileExprsToSqlColumns(exclExprList, queryParams, ctx)
    : [];
  const exclColumnsSQL = exclColumnsSql.length > 0
    ? ',\n              ' + exclColumnsSql.join(',\n              ')
    : '';

  const ctes: Array<{ name: string; query: QueryNode }> = [];

  if (includeTimestampCols && (orderType === 'ordered' || orderType === 'strict')) {
    // Two-CTE approach for ordered and strict modes: collect step_0 timestamps + last_step_ms
    // in raw CTE, then derive the correct first_step_ms in funnel_per_user.
    const winMs = `toInt64({window:UInt64}) * 1000`;

    // funnel_raw CTE: aggregates per person with windowFunnel + timestamp arrays.
    // Built as raw SQL — windowFunnel() and groupArrayIf() have no builder equivalent.
    const funnelRawNode = select(rawWithParams(`
              ${RESOLVED_PERSON} AS person_id,
              ${wfExpr} AS max_step${breakdownCol},
              groupArrayIf(toUnixTimestamp64Milli(timestamp), ${step0Cond}) AS t0_arr,
              toInt64(minIf(toUnixTimestamp64Milli(timestamp), ${lastStepCond})) AS last_step_ms${exclColumnsSQL}
            FROM events
            WHERE
              project_id = {project_id:UUID}
              AND timestamp >= ${fromExpr}
              AND timestamp <= ${toExpr}${eventNameFilter}${cohortClause}${samplingClause}
            GROUP BY person_id`, queryParams))
      .build();

    ctes.push({ name: 'funnel_raw', query: funnelRawNode });

    // Forward exclusion column names from raw CTE into funnel_per_user.
    const exclColsForward = exclColumnsSql.length > 0
      ? ',\n              ' + exclColumnsSql.map(c => {
        const m = / AS (\w+)$/.exec(c);
        return m ? m[1] : c;
      }).join(',\n              ')
      : '';

    const breakdownForward = breakdownExpr ? ',\n              breakdown_value' : '';

    // first_step_ms: step_0 timestamp where last_step_ms falls within [t0, t0 + window].
    const arrayAgg = orderType === 'strict' ? 'arrayMax' : 'arrayMin';
    const firstStepMsExpr = `if(
              notEmpty(arrayFilter(t0 -> t0 <= last_step_ms AND last_step_ms <= t0 + ${winMs} AND last_step_ms > 0, t0_arr)),
              toInt64(${arrayAgg}(arrayFilter(t0 -> t0 <= last_step_ms AND last_step_ms <= t0 + ${winMs} AND last_step_ms > 0, t0_arr))),
              toInt64(0)
            )`;

    const funnelPerUserNode = select(raw(`
              person_id,
              max_step${breakdownForward},
              ${firstStepMsExpr} AS first_step_ms,
              last_step_ms${exclColsForward}
            FROM funnel_raw`))
      .build();

    ctes.push({ name: 'funnel_per_user', query: funnelPerUserNode });
  } else {
    // Single-CTE approach: no timestamp columns needed or unordered mode.
    const timestampCols = includeTimestampCols
      ? `,\n              minIf(toUnixTimestamp64Milli(timestamp), ${step0Cond}) AS first_step_ms,\n              minIf(toUnixTimestamp64Milli(timestamp), ${lastStepCond}) AS last_step_ms`
      : '';

    // Single CTE: built as raw SQL — windowFunnel() has no builder equivalent.
    const funnelPerUserNode = select(rawWithParams(`
              ${RESOLVED_PERSON} AS person_id,
              ${wfExpr} AS max_step${breakdownCol}${timestampCols}${exclColumnsSQL}
            FROM events
            WHERE
              project_id = {project_id:UUID}
              AND timestamp >= ${fromExpr}
              AND timestamp <= ${toExpr}${eventNameFilter}${cohortClause}${samplingClause}
            GROUP BY person_id`, queryParams))
      .build();

    ctes.push({ name: 'funnel_per_user', query: funnelPerUserNode });
  }

  // excluded_users CTE (if exclusions are present)
  if (exclusions.length > 0) {
    ctes.push({ name: 'excluded_users', query: buildExcludedUsersCTE(exclusions) });
  }

  return { ctes, hasExclusions: exclusions.length > 0 };
}
