import type { ClickHouseClient } from '@qurvo/clickhouse';
import {
  compile,
  compileExprToSql,
  CompilerContext,
  select,
  raw,
  rawWithParams,
  col,
  literal,
  avgIf,
  countIf,
  minIf,
  maxIf,
  toInt64,
  and,
  gt,
  gte,
  lte,
  notInSubquery,
  groupArrayIf,
  type Expr,
  type QueryNode,
} from '@qurvo/ch-query';
import { cohortFilter, cohortBounds } from '../query-helpers';
import { AppBadRequestException } from '../../exceptions/app-bad-request.exception';
import type { TimeToConvertParams, TimeToConvertResult, TimeToConvertBin, FunnelOrderType } from './funnel.types';
import {
  RESOLVED_PERSON,
  toChTs,
  resolveWindowSeconds,
  buildStepCondition,
  buildSamplingClause,
  buildWindowFunnelExpr,
  buildAllEventNames,
  buildExclusionColumns,
  buildExcludedUsersCTE,
  buildUnorderedCoverageExprs,
  buildStrictUserFilterExpr,
  validateExclusions,
  validateUnorderedSteps,
  funnelTsParamExpr,
  compileExprsToSqlColumns,
  type FunnelChQueryParams,
} from './funnel-sql-shared';

/** Maximum number of bins in the histogram. */
const MAX_BINS = 60;

/**
 * Compute time-to-convert stats and histogram in a single ClickHouse query.
 *
 * Two-level CTE structure (single events scan):
 *   funnel_raw      — per-person windowFunnel + groupArrayIf per step (one full scan)
 *   funnel_per_user — derives sequence-aware step_i_ms from raw arrays:
 *                     step_0_ms = arrayMin(step_0_arr)
 *                     step_i_ms = first occurrence of step i that is >= step_{i-1}_ms
 *                     This prevents earliest-ever occurrences (before step 0) from
 *                     skewing TTC when from_step > 0.
 *   converted       — filter to users who reached to_step within window
 *   final SELECT    — computes avg, min, max, count AND collects all
 *                     duration_seconds values in groupArray — all in one pass.
 *                     Median is computed in TypeScript from the durations array
 *                     for exact results (traditional statistical median).
 *
 * Histogram binning is done in JS from the returned durations array:
 *   - bin_count and bin_width are computed from server-side min/max/count
 *   - a simple for-loop bins each duration (no Math.min/max spread, no V8 stack risk)
 */

export async function queryFunnelTimeToConvert(
  ch: ClickHouseClient,
  params: TimeToConvertParams,
): Promise<TimeToConvertResult> {
  const { steps, project_id, from_step: fromStep, to_step: toStep } = params;
  const exclusions = params.exclusions ?? [];
  const numSteps = steps.length;
  const windowSeconds = resolveWindowSeconds(params);
  const orderType: FunnelOrderType = params.funnel_order_type ?? 'ordered';

  if (fromStep >= toStep) {
    throw new AppBadRequestException('from_step must be strictly less than to_step');
  }
  if (toStep >= numSteps) {
    throw new AppBadRequestException(`to_step ${toStep} out of range (max ${numSteps - 1})`);
  }

  validateExclusions(exclusions, numSteps, steps);

  if (orderType === 'unordered') {
    validateUnorderedSteps(steps);
  }

  const allEventNames = buildAllEventNames(steps, exclusions);

  const hasTz = !!(params.timezone && params.timezone !== 'UTC');
  const queryParams: FunnelChQueryParams = {
    project_id,
    from: toChTs(params.date_from),
    to: toChTs(params.date_to, true),
    window: windowSeconds,
    num_steps: steps.length,
    all_event_names: allEventNames,
    // TTC-specific params
    step_names: allEventNames,
    to_step_num: toStep + 1,
    window_seconds: windowSeconds,
  };
  if (hasTz) {queryParams.tz = params.timezone;}

  const ctx = new CompilerContext();

  // Compile cohort, sampling, and timestamp expressions via AST
  const { dateTo, dateFrom } = cohortBounds(params);
  const cohortExpr = cohortFilter(params.cohort_filters, params.project_id, dateTo, dateFrom);
  const cohortClause = cohortExpr ? ' AND ' + compileExprToSql(cohortExpr, queryParams, ctx).sql : '';

  const samplingExpr = buildSamplingClause(params.sampling_factor, queryParams);
  const samplingClause = samplingExpr
    ? '\n                AND ' + compileExprToSql(samplingExpr, queryParams, ctx).sql
    : '';

  // Build step conditions as Expr, then compile to SQL strings
  const stepCondExprs = steps.map((s, i) => buildStepCondition(s, i));
  const stepConds = stepCondExprs.map(expr => compileExprToSql(expr, queryParams, ctx).sql);

  // Build exclusion columns as Expr[], then compile to SQL strings
  const exclExprList = exclusions.length > 0
    ? buildExclusionColumns(exclusions, steps)
    : [];
  const exclColumnsSql = exclExprList.length > 0
    ? compileExprsToSqlColumns(exclExprList, queryParams, ctx)
    : [];

  const shared = { ch, queryParams, stepConds, exclColumnsSql, exclusions, fromStep, toStep, cohortClause, samplingClause, ctx };

  if (orderType === 'unordered') {
    return buildUnorderedTtc(shared);
  }

  return buildOrderedTtc({ ...shared, stepCondExprs, numSteps, orderType });
}

// ── Ordered TTC ──────────────────────────────────────────────────────────────

interface OrderedTtcOptions {
  ch: ClickHouseClient;
  queryParams: FunnelChQueryParams;
  stepConds: string[];
  stepCondExprs: Expr[];
  exclColumnsSql: string[];
  exclusions: NonNullable<TimeToConvertParams['exclusions']>;
  fromStep: number;
  toStep: number;
  numSteps: number;
  orderType: FunnelOrderType;
  cohortClause: string;
  samplingClause: string;
  ctx: CompilerContext;
}

async function buildOrderedTtc(options: OrderedTtcOptions): Promise<TimeToConvertResult> {
  const {
    ch, queryParams, stepConds, stepCondExprs, exclColumnsSql, exclusions,
    fromStep, toStep, numSteps, orderType, cohortClause, samplingClause, ctx,
  } = options;
  // Compile windowFunnel Expr to SQL
  const wfExprAst = buildWindowFunnelExpr(orderType, stepCondExprs);
  const wfExprSql = compileExprToSql(wfExprAst, queryParams, ctx).sql;

  // Timestamp param expressions (AST)
  const fromExprAst = funnelTsParamExpr('from', queryParams);
  const toExprAst = funnelTsParamExpr('to', queryParams);
  const fromExpr = compileExprToSql(fromExprAst, queryParams, ctx).sql;
  const toExpr = compileExprToSql(toExprAst, queryParams, ctx).sql;

  // Strict user filter via AST
  const eventNameFilterExpr = buildStrictUserFilterExpr(fromExprAst, toExprAst, 'step_names', queryParams.all_event_names, queryParams.project_id, orderType);
  const eventNameFilter = '\n                AND ' + compileExprToSql(eventNameFilterExpr, queryParams, ctx).sql;

  const stepArrayCols = stepConds.map(
    (cond, i) => `groupArrayIf(toUnixTimestamp64Milli(timestamp), ${cond}) AS step_${i}_arr`,
  ).join(',\n            ');

  const fromCol = `step_${fromStep}_ms`;
  const toCol = `step_${toStep}_ms`;

  // Aggregation expressions for funnel_raw (e.g. "groupArrayIf(...) AS excl_0_from_arr")
  const exclColumnsSQL = exclColumnsSql.length > 0
    ? ',\n            ' + exclColumnsSql.join(',\n            ')
    : '';
  // Pass-through aliases for funnel_per_user (e.g. "excl_0_from_arr")
  const exclColumnAliases = exclColumnsSql.map((expr) => {
    const match = /AS (\w+)$/.exec(expr.trim());
    return match ? match[1] : expr;
  });
  const exclAliasSQL = exclColumnAliases.length > 0
    ? ',\n      ' + exclColumnAliases.join(',\n      ')
    : '';

  const ctes: Array<{ name: string; query: QueryNode }> = [];

  // ── CTE: funnel_raw ──
  const winMsExpr = `toInt64({window:UInt64}) * 1000`;

  const funnelRawNode = select(rawWithParams(`
            ${RESOLVED_PERSON} AS person_id,
            ${wfExprSql} AS max_step,
            ${stepArrayCols},
            toInt64(minIf(toUnixTimestamp64Milli(timestamp), ${stepConds[toStep]})) AS last_step_prelim_ms${exclColumnsSQL}
          FROM events
          WHERE
            project_id = {project_id:UUID}
            AND timestamp >= ${fromExpr}
            AND timestamp <= ${toExpr}${eventNameFilter}${cohortClause}${samplingClause}
          GROUP BY person_id`, queryParams))
    .build();

  ctes.push({ name: 'funnel_raw', query: funnelRawNode });

  // ── CTEs: seq_step_0 .. seq_step_{N-1} ──
  for (let i = 0; i < numSteps; i++) {
    const prevCTE = i === 0 ? 'funnel_raw' : `seq_step_${i - 1}`;
    const passThrough = [
      'person_id',
      'max_step',
      'last_step_prelim_ms',
      ...Array.from({ length: numSteps }, (_, j) => `step_${j}_arr`),
      ...Array.from({ length: i }, (_, j) => `step_${j}_ms`),
      ...exclColumnAliases,
    ].join(',\n        ');

    let stepMsExpr: string;
    if (i === 0) {
      stepMsExpr =
        `if(\n          notEmpty(arrayFilter(t0 -> t0 <= last_step_prelim_ms AND last_step_prelim_ms - t0 <= ${winMsExpr} AND last_step_prelim_ms > 0, step_0_arr)),\n          toInt64(arrayMin(arrayFilter(t0 -> t0 <= last_step_prelim_ms AND last_step_prelim_ms - t0 <= ${winMsExpr} AND last_step_prelim_ms > 0, step_0_arr))),\n          toInt64(0)\n        ) AS step_0_ms`;
    } else {
      stepMsExpr =
        `if(notEmpty(arrayFilter(t${i} -> t${i} >= step_${i - 1}_ms, step_${i}_arr)),` +
        ` arrayMin(arrayFilter(t${i} -> t${i} >= step_${i - 1}_ms, step_${i}_arr)),` +
        ` 0) AS step_${i}_ms`;
    }

    const seqStepNode = select(raw(`
        ${passThrough},
        ${stepMsExpr}
      FROM ${prevCTE}`))
      .build();

    ctes.push({ name: `seq_step_${i}`, query: seqStepNode });
  }

  // ── CTE: funnel_per_user ──
  const lastSeqCTE = `seq_step_${numSteps - 1}`;
  const stepMsCols = Array.from({ length: numSteps }, (_, i) => `step_${i}_ms`).join(',\n        ');

  const funnelPerUserNode = select(raw(`
        person_id,
        max_step,
        ${stepMsCols}${exclAliasSQL}
      FROM ${lastSeqCTE}`))
    .build();

  ctes.push({ name: 'funnel_per_user', query: funnelPerUserNode });

  // ── CTE: excluded_users (if exclusions present) ──
  if (exclusions.length > 0) {
    ctes.push({ name: 'excluded_users', query: buildExcludedUsersCTE(exclusions) });
  }

  // ── CTE: converted ──
  const exclAndCondition = exclusions.length > 0
    ? notInSubquery(col('person_id'), select(col('person_id')).from('excluded_users').build())
    : undefined;

  const convertedNode = select(
    raw(`(${toCol} - ${fromCol}) / 1000.0`).as('duration_seconds'),
  )
    .from('funnel_per_user')
    .where(
      gte(col('max_step'), raw('{to_step_num:UInt64}')),
      exclAndCondition,
    )
    .build();

  ctes.push({ name: 'converted', query: convertedNode });

  // ── Final SELECT ──
  const durationFilter = and(
    gte(col('duration_seconds'), literal(0)),
    lte(col('duration_seconds'), raw('{window_seconds:Float64}')),
  );

  const finalQuery = select(
    avgIf(col('duration_seconds'), durationFilter).as('avg_seconds'),
    toInt64(countIf(durationFilter)).as('sample_size'),
    minIf(col('duration_seconds'), durationFilter).as('min_seconds'),
    maxIf(col('duration_seconds'), durationFilter).as('max_seconds'),
    groupArrayIf(col('duration_seconds'), durationFilter).as('durations'),
  )
    .withAll(ctes)
    .from('converted')
    .build();

  const compiled = compile(finalQuery);
  const queryResult = await ch.query({ query: compiled.sql, query_params: compiled.params, format: 'JSONEachRow' });
  const rows = await queryResult.json<TtcAggRow>();

  return parseTtcRows(rows, fromStep, toStep);
}

// ── Shared result-row types and parser ───────────────────────────────────────

/** @internal Exported for unit testing only. */
export interface TtcAggRow {
  avg_seconds: string | null;
  sample_size: string;
  min_seconds: string | null;
  max_seconds: string | null;
  durations: number[];
}

/**
 * Compute the exact median from a sorted array of numbers.
 *
 * For even-length arrays, returns the average of the two middle values
 * (traditional statistical median). This is consistent with the histogram
 * bins derived from the same `durations` array.
 */
function exactMedian(values: number[]): number | null {
  if (values.length === 0) {return null;}
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/** @internal Exported for unit testing only. */
export function parseTtcRows(rows: TtcAggRow[], fromStep: number, toStep: number): TimeToConvertResult {
  const row = rows[0];
  const sampleSize = Number(row?.sample_size ?? 0);

  if (sampleSize === 0) {
    return { from_step: fromStep, to_step: toStep, average_seconds: null, median_seconds: null, sample_size: 0, bins: [] };
  }

  const avgSeconds = row.avg_seconds !== null && row.avg_seconds !== undefined ? Math.round(Number(row.avg_seconds)) : null;
  const durations: number[] = row.durations ?? [];
  const rawMedian = exactMedian(durations);
  const medianSeconds = rawMedian !== null && rawMedian !== undefined ? Math.round(rawMedian) : null;
  const minVal = Number(row.min_seconds ?? 0);
  const maxVal = Number(row.max_seconds ?? 0);

  // When all converters took exactly the same time (range = 0), return a single
  // point bin instead of creating binCount empty bins spanning an arbitrary range.
  const range = maxVal - minVal;
  if (range === 0) {
    const pointSec = Math.round(minVal);
    const bins: TimeToConvertBin[] = [{ from_seconds: pointSec, to_seconds: pointSec + 1, count: sampleSize }];
    return { from_step: fromStep, to_step: toStep, average_seconds: avgSeconds, median_seconds: medianSeconds, sample_size: sampleSize, bins };
  }

  // Determine bin parameters.
  const binCount = Math.max(1, Math.min(MAX_BINS, Math.ceil(Math.cbrt(sampleSize))));
  const binWidth = Math.max(1, Math.ceil(range / binCount));

  // Build dense bin array by iterating durations with a for-loop.
  // Using a loop (not Math.min/max spread) avoids V8 stack overflow on large arrays.
  const binCountByIdx = new Map<number, number>();
  for (const d of durations) {
    const idx = Math.max(0, Math.min(binCount - 1, Math.floor((d - minVal) / binWidth)));
    binCountByIdx.set(idx, (binCountByIdx.get(idx) ?? 0) + 1);
  }

  const bins: TimeToConvertBin[] = [];
  const maxRounded = Math.round(maxVal);
  for (let i = 0; i < binCount; i++) {
    const fromSec = Math.round(minVal + i * binWidth);
    const toSec = i === binCount - 1
      ? maxRounded
      : Math.round(minVal + (i + 1) * binWidth);
    bins.push({ from_seconds: fromSec, to_seconds: toSec, count: binCountByIdx.get(i) ?? 0 });
  }

  return { from_step: fromStep, to_step: toStep, average_seconds: avgSeconds, median_seconds: medianSeconds, sample_size: sampleSize, bins };
}

// ── Unordered TTC ────────────────────────────────────────────────────────────

/**
 * Builds and executes the TTC query for unordered funnels.
 *
 * Uses the same groupArrayIf + arrayExists anchor logic as funnel-unordered.sql.ts:
 *   - Collects all timestamps per step as arrays via groupArrayIf.
 *   - Tries every timestamp from every step array as a candidate anchor.
 *   - max_step = maximum steps coverable from any candidate anchor.
 *   - anchor_ms = first anchor (tried t_fromStep_arr first) that achieves full coverage.
 *
 * Duration = |t_{to_step}_first_in_window - anchor_ms|
 * This matches the corrected unordered funnel semantics: the duration is measured
 * from the anchor of the successful conversion window.
 */
interface UnorderedTtcOptions {
  ch: ClickHouseClient;
  queryParams: FunnelChQueryParams;
  stepConds: string[];
  exclColumnsSql: string[];
  exclusions: NonNullable<TimeToConvertParams['exclusions']>;
  fromStep: number;
  toStep: number;
  cohortClause: string;
  samplingClause: string;
  ctx: CompilerContext;
}

async function buildUnorderedTtc(options: UnorderedTtcOptions): Promise<TimeToConvertResult> {
  const {
    ch, queryParams, stepConds, exclColumnsSql, exclusions,
    fromStep, toStep, cohortClause, samplingClause, ctx,
  } = options;
  const N = stepConds.length;
  const winExpr = `toInt64({window:UInt64}) * 1000`;

  // Timestamp param expressions (AST)
  const fromExprAst = funnelTsParamExpr('from', queryParams);
  const toExprAst = funnelTsParamExpr('to', queryParams);
  const fromExprSql = compileExprToSql(fromExprAst, queryParams, ctx).sql;
  const toExprSql = compileExprToSql(toExprAst, queryParams, ctx).sql;

  // Collect all timestamps per step as arrays.
  const groupArrayCols = stepConds.map(
    (cond, i) => `groupArrayIf(toUnixTimestamp64Milli(timestamp), ${cond}) AS t${i}_arr`,
  ).join(',\n        ');

  // Exclusion array columns.
  const exclColsSQL = exclColumnsSql.length > 0
    ? ',\n        ' + exclColumnsSql.join(',\n        ')
    : '';

  // Coverage, max_step, anchor_ms — shared with funnel-unordered.sql.ts
  const { maxStepExpr, anchorMsExpr } =
    buildUnorderedCoverageExprs(N, winExpr, stepConds);

  // Pass-through exclusion aliases from step_times to anchor_per_user.
  const exclColAliases = exclColumnsSql.map(c => {
    const m = /AS (\w+)$/.exec(c.trim());
    return m ? m[1] : c;
  });
  const exclColsForward = exclColAliases.length > 0
    ? ',\n        ' + exclColAliases.join(',\n        ')
    : '';

  // Guard on step-0 (anchor step) only — users without step-0 cannot enter the funnel.
  const anyStepNonEmpty = `length(t0_arr) > 0`;

  const ctes: Array<{ name: string; query: QueryNode }> = [];

  // ── CTE: step_times ──
  const stepTimesNode = select(rawWithParams(`
        ${RESOLVED_PERSON} AS person_id,
        ${groupArrayCols}${exclColsSQL}
      FROM events
      WHERE
        project_id = {project_id:UUID}
        AND timestamp >= ${fromExprSql}
        AND timestamp <= ${toExprSql}
        AND event_name IN ({step_names:Array(String)})${cohortClause}${samplingClause}
      GROUP BY person_id`, queryParams))
    .build();

  ctes.push({ name: 'step_times', query: stepTimesNode });

  // ── CTE: anchor_per_user ──
  const anchorPerUserNode = select(raw(`
        person_id,
        toInt64(${maxStepExpr}) AS max_step,
        toInt64(${anchorMsExpr}) AS anchor_ms${exclColsForward},
        ${Array.from({ length: N }, (_, i) => `t${i}_arr`).join(', ')}
      FROM step_times
      WHERE ${anyStepNonEmpty}`))
    .build();

  ctes.push({ name: 'anchor_per_user', query: anchorPerUserNode });

  // ── CTE: funnel_per_user ──
  const funnelPerUserNode = select(raw(`
        person_id,
        max_step,
        anchor_ms,
        anchor_ms AS first_step_ms,
        toInt64(if(
          notEmpty(arrayFilter(tf -> tf >= anchor_ms AND tf <= anchor_ms + ${winExpr}, t${fromStep}_arr)),
          arrayMin(arrayFilter(tf -> tf >= anchor_ms AND tf <= anchor_ms + ${winExpr}, t${fromStep}_arr)),
          toInt64(0)
        )) AS from_step_ms,
        toInt64(if(
          notEmpty(arrayFilter(tv -> tv >= anchor_ms AND tv <= anchor_ms + ${winExpr}, t${toStep}_arr)),
          arrayMin(arrayFilter(tv -> tv >= anchor_ms AND tv <= anchor_ms + ${winExpr}, t${toStep}_arr)),
          toInt64(0)
        )) AS to_step_ms${exclColsForward}
      FROM anchor_per_user`))
    .build();

  ctes.push({ name: 'funnel_per_user', query: funnelPerUserNode });

  // ── CTE: excluded_users (if exclusions present) — anchorFilter=true for unordered (#497) ──
  if (exclusions.length > 0) {
    ctes.push({ name: 'excluded_users', query: buildExcludedUsersCTE(exclusions, true) });
  }

  // ── CTE: converted ──
  const exclAndCondition = exclusions.length > 0
    ? notInSubquery(col('person_id'), select(col('person_id')).from('excluded_users').build())
    : undefined;

  const convertedNode = select(
    raw('(to_step_ms - from_step_ms) / 1000.0').as('duration_seconds'),
  )
    .from('funnel_per_user')
    .where(
      gte(col('max_step'), raw('{to_step_num:UInt64}')),
      gte(col('to_step_ms'), col('from_step_ms')),
      gt(col('from_step_ms'), literal(0)),
      exclAndCondition,
    )
    .build();

  ctes.push({ name: 'converted', query: convertedNode });

  // ── Final SELECT ──
  const durationFilter = and(
    gte(col('duration_seconds'), literal(0)),
    lte(col('duration_seconds'), raw('{window_seconds:Float64}')),
  );

  const finalQuery = select(
    avgIf(col('duration_seconds'), durationFilter).as('avg_seconds'),
    toInt64(countIf(durationFilter)).as('sample_size'),
    minIf(col('duration_seconds'), durationFilter).as('min_seconds'),
    maxIf(col('duration_seconds'), durationFilter).as('max_seconds'),
    groupArrayIf(col('duration_seconds'), durationFilter).as('durations'),
  )
    .withAll(ctes)
    .from('converted')
    .build();

  const compiled = compile(finalQuery);
  const queryResult = await ch.query({ query: compiled.sql, query_params: compiled.params, format: 'JSONEachRow' });
  const rows = await queryResult.json<TtcAggRow>();
  return parseTtcRows(rows, fromStep, toStep);
}
