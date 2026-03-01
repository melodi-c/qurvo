import type { ClickHouseClient } from '@qurvo/clickhouse';
import { ChQueryExecutor } from '@qurvo/clickhouse';
import {
  select,
  col,
  literal,
  func,
  lambda,
  length,
  namedParam,
  alias,
  avgIf,
  countIf,
  minIf,
  maxIf,
  toInt64,
  toUnixTimestamp64Milli,
  groupArrayIf,
  notEmpty,
  ifExpr,
  arrayMin,
  and,
  gt,
  gte,
  lte,
  sub,
  add,
  inArray,
  type Expr,
  type QueryNode,
} from '@qurvo/ch-query';
import { cohortFilter, cohortBounds, resolvedPerson } from '../query-helpers';
import { AppBadRequestException } from '../../exceptions/app-bad-request.exception';
import type { TimeToConvertParams, TimeToConvertResult, TimeToConvertBin, FunnelOrderType } from './funnel.types';
import {
  toChTs,
  resolveWindowSeconds,
  buildStepCondition,
  buildSamplingClause,
  buildWindowFunnelExpr,
  buildAllEventNames,
  buildExclusionColumns,
  buildExcludedUsersCTE,
  buildUnorderedCoverageExprsAST,
  buildStrictUserFilterExpr,
  validateExclusions,
  validateUnorderedSteps,
  funnelTsParamExpr,
  windowMsExpr as sharedWindowMsExpr,
  notInExcludedUsers,
  funnelProjectIdExpr,
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

  // Build cohort and sampling as Expr AST nodes
  const { dateTo, dateFrom } = cohortBounds(params);
  const cohortExpr = cohortFilter(params.cohort_filters, params.project_id, dateTo, dateFrom);
  const samplingExpr = buildSamplingClause(params.sampling_factor, queryParams);

  // Build step conditions as Expr AST nodes
  const stepCondExprs = steps.map((s, i) => buildStepCondition(s, i));

  // Build exclusion columns as Expr[]
  const exclExprList = exclusions.length > 0
    ? buildExclusionColumns(exclusions, steps)
    : [];

  const shared = { ch, queryParams, stepCondExprs, exclExprList, exclusions, fromStep, toStep, cohortExpr, samplingExpr };

  if (orderType === 'unordered') {
    return buildUnorderedTtc({ ...shared, numSteps: stepCondExprs.length });
  }

  return buildOrderedTtc({ ...shared, numSteps, orderType });
}

// Ordered TTC

interface OrderedTtcOptions {
  ch: ClickHouseClient;
  queryParams: FunnelChQueryParams;
  stepCondExprs: Expr[];
  exclExprList: Expr[];
  exclusions: NonNullable<TimeToConvertParams['exclusions']>;
  fromStep: number;
  toStep: number;
  numSteps: number;
  orderType: FunnelOrderType;
  cohortExpr: Expr | undefined;
  samplingExpr: Expr | undefined;
}

async function buildOrderedTtc(options: OrderedTtcOptions): Promise<TimeToConvertResult> {
  const {
    ch, queryParams, stepCondExprs, exclExprList, exclusions,
    fromStep, toStep, numSteps, orderType, cohortExpr, samplingExpr,
  } = options;

  // AST expressions for windowFunnel and timestamps
  const wfExprAst = buildWindowFunnelExpr(orderType, stepCondExprs, queryParams);
  const fromExprAst = funnelTsParamExpr('from', queryParams);
  const toExprAst = funnelTsParamExpr('to', queryParams);

  // Strict user filter via AST
  const eventNameFilterExpr = buildStrictUserFilterExpr(
    fromExprAst, toExprAst, 'step_names',
    queryParams.all_event_names, queryParams.project_id, orderType,
  );

  // Step array columns: groupArrayIf(toUnixTimestamp64Milli(timestamp), stepCond) AS step_i_arr
  const stepArrayColExprs: Expr[] = stepCondExprs.map(
    (cond, i) => groupArrayIf(toUnixTimestamp64Milli(col('timestamp')), cond).as(`step_${i}_arr`),
  );

  const fromCol = `step_${fromStep}_ms`;
  const toCol = `step_${toStep}_ms`;

  // Exclusion column aliases (for pass-through in downstream CTEs)
  const exclColumnAliases = extractExclAliases(exclExprList);

  const winMs = sharedWindowMsExpr(queryParams);

  const ctes: Array<{ name: string; query: QueryNode }> = [];

  // CTE: funnel_raw
  const funnelRawNode = select(
    resolvedPerson().as('person_id'),
    alias(wfExprAst, 'max_step'),
    ...stepArrayColExprs,
    toInt64(minIf(toUnixTimestamp64Milli(col('timestamp')), stepCondExprs[toStep])).as('last_step_prelim_ms'),
    ...exclExprList,
  )
    .from('events')
    .where(
      funnelProjectIdExpr(queryParams),
      gte(col('timestamp'), fromExprAst),
      lte(col('timestamp'), toExprAst),
      eventNameFilterExpr,
      cohortExpr,
      samplingExpr,
    )
    .groupBy(col('person_id'))
    .build();

  ctes.push({ name: 'funnel_raw', query: funnelRawNode });

  // CTEs: seq_step_0 .. seq_step_{N-1}
  for (let i = 0; i < numSteps; i++) {
    const prevCTE = i === 0 ? 'funnel_raw' : `seq_step_${i - 1}`;

    // Pass-through columns from previous CTE
    const passThroughCols: Expr[] = [
      col('person_id'),
      col('max_step'),
      col('last_step_prelim_ms'),
      ...Array.from({ length: numSteps }, (_, j) => col(`step_${j}_arr`)),
      ...Array.from({ length: i }, (_, j) => col(`step_${j}_ms`)),
      ...exclColumnAliases.map(a => col(a)),
    ];

    // Build the step_i_ms expression
    let stepMsExprAst: Expr;
    if (i === 0) {
      // step_0_ms: arrayMin of step_0_arr timestamps within [last_step_prelim_ms - window, last_step_prelim_ms]
      const filterCond = and(
        lte(col('t0'), col('last_step_prelim_ms')),
        lte(sub(col('last_step_prelim_ms'), col('t0')), winMs),
        gt(col('last_step_prelim_ms'), literal(0)),
      );
      const filteredArr = func('arrayFilter', lambda(['t0'], filterCond), col('step_0_arr'));
      stepMsExprAst = ifExpr(
        notEmpty(filteredArr),
        toInt64(arrayMin(filteredArr)),
        toInt64(literal(0)),
      );
    } else {
      // step_i_ms: first element of step_i_arr that is >= step_{i-1}_ms
      const varName = `t${i}`;
      const filterCond = gte(col(varName), col(`step_${i - 1}_ms`));
      const filteredArr = func('arrayFilter', lambda([varName], filterCond), col(`step_${i}_arr`));
      stepMsExprAst = ifExpr(
        notEmpty(filteredArr),
        arrayMin(filteredArr),
        literal(0),
      );
    }

    const seqStepNode = select(
      ...passThroughCols,
      alias(stepMsExprAst, `step_${i}_ms`),
    )
      .from(prevCTE)
      .build();

    ctes.push({ name: `seq_step_${i}`, query: seqStepNode });
  }

  // CTE: funnel_per_user
  const lastSeqCTE = `seq_step_${numSteps - 1}`;
  const funnelPerUserNode = select(
    col('person_id'),
    col('max_step'),
    ...Array.from({ length: numSteps }, (_, i) => col(`step_${i}_ms`)),
    ...exclColumnAliases.map(a => col(a)),
  )
    .from(lastSeqCTE)
    .build();

  ctes.push({ name: 'funnel_per_user', query: funnelPerUserNode });

  // CTE: excluded_users (if exclusions present)
  if (exclusions.length > 0) {
    ctes.push({ name: 'excluded_users', query: buildExcludedUsersCTE(exclusions, false, queryParams) });
  }

  // CTE: converted
  const exclAndCondition = exclusions.length > 0
    ? notInExcludedUsers()
    : undefined;

  const convertedNode = select(
    func('divide', func('minus', col(toCol), col(fromCol)), literal(1000.0)).as('duration_seconds'),
  )
    .from('funnel_per_user')
    .where(
      gte(col('max_step'), namedParam('to_step_num', 'UInt64', queryParams.to_step_num)),
      exclAndCondition,
    )
    .build();

  ctes.push({ name: 'converted', query: convertedNode });

  // Final SELECT
  const durationFilter = and(
    gte(col('duration_seconds'), literal(0)),
    lte(col('duration_seconds'), namedParam('window_seconds', 'Float64', queryParams.window_seconds)),
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

  const rows = await new ChQueryExecutor(ch).rows<TtcAggRow>(finalQuery);

  return parseTtcRows(rows, fromStep, toStep);
}

// Shared result-row types and parser

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

// Helpers

/**
 * Extracts alias names from exclusion Expr list.
 * buildExclusionColumns returns triplets: excl_i_from_arr, excl_i_to_arr, excl_i_arr.
 */
function extractExclAliases(exclExprList: Expr[]): string[] {
  return exclExprList.map(expr => {
    if (expr.type === 'alias') {return (expr as { alias: string }).alias;}
    return '';
  }).filter(Boolean);
}

// Unordered TTC

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
  stepCondExprs: Expr[];
  exclExprList: Expr[];
  exclusions: NonNullable<TimeToConvertParams['exclusions']>;
  fromStep: number;
  toStep: number;
  numSteps: number;
  cohortExpr: Expr | undefined;
  samplingExpr: Expr | undefined;
}

async function buildUnorderedTtc(options: UnorderedTtcOptions): Promise<TimeToConvertResult> {
  const {
    ch, queryParams, stepCondExprs, exclExprList, exclusions,
    fromStep, toStep, numSteps, cohortExpr, samplingExpr,
  } = options;
  const N = numSteps;
  const winMs = sharedWindowMsExpr(queryParams);

  // Timestamp param expressions (AST)
  const fromExprAst = funnelTsParamExpr('from', queryParams);
  const toExprAst = funnelTsParamExpr('to', queryParams);

  // Collect all timestamps per step as arrays
  const groupArrayColExprs: Expr[] = stepCondExprs.map(
    (cond, i) => groupArrayIf(toUnixTimestamp64Milli(col('timestamp')), cond).as(`t${i}_arr`),
  );

  // Coverage, max_step, anchor_ms — shared AST expressions
  const { maxStepExpr, anchorMsExpr } =
    buildUnorderedCoverageExprsAST(N, winMs, stepCondExprs);

  // Exclusion column aliases for pass-through
  const exclColumnAliases = extractExclAliases(exclExprList);

  const ctes: Array<{ name: string; query: QueryNode }> = [];

  // CTE: step_times
  const stepTimesNode = select(
    resolvedPerson().as('person_id'),
    ...groupArrayColExprs,
    ...exclExprList,
  )
    .from('events')
    .where(
      funnelProjectIdExpr(queryParams),
      gte(col('timestamp'), fromExprAst),
      lte(col('timestamp'), toExprAst),
      inArray(col('event_name'), namedParam('step_names', 'Array(String)', queryParams.step_names)),
      cohortExpr,
      samplingExpr,
    )
    .groupBy(col('person_id'))
    .build();

  ctes.push({ name: 'step_times', query: stepTimesNode });

  // CTE: anchor_per_user
  const anchorPerUserNode = select(
    col('person_id'),
    toInt64(maxStepExpr).as('max_step'),
    toInt64(anchorMsExpr).as('anchor_ms'),
    ...exclColumnAliases.map(a => col(a)),
    ...Array.from({ length: N }, (_, i) => col(`t${i}_arr`)),
  )
    .from('step_times')
    .where(gt(length(col('t0_arr')), literal(0)))
    .build();

  ctes.push({ name: 'anchor_per_user', query: anchorPerUserNode });

  // CTE: funnel_per_user
  // from_step_ms and to_step_ms: first timestamp in [anchor_ms, anchor_ms + window] from respective step arrays
  const buildStepMsInWindowExpr = (varName: string, stepIdx: number): Expr => {
    const filterCond = and(
      gte(col(varName), col('anchor_ms')),
      lte(col(varName), add(col('anchor_ms'), winMs)),
    );
    const filteredArr = func('arrayFilter', lambda([varName], filterCond), col(`t${stepIdx}_arr`));
    return toInt64(ifExpr(
      notEmpty(filteredArr),
      arrayMin(filteredArr),
      toInt64(literal(0)),
    ));
  };

  const funnelPerUserNode = select(
    col('person_id'),
    col('max_step'),
    col('anchor_ms'),
    col('anchor_ms').as('first_step_ms'),
    alias(buildStepMsInWindowExpr('tf', fromStep), 'from_step_ms'),
    alias(buildStepMsInWindowExpr('tv', toStep), 'to_step_ms'),
    ...exclColumnAliases.map(a => col(a)),
  )
    .from('anchor_per_user')
    .build();

  ctes.push({ name: 'funnel_per_user', query: funnelPerUserNode });

  // CTE: excluded_users (if exclusions present) — anchorFilter=true for unordered (#497)
  if (exclusions.length > 0) {
    ctes.push({ name: 'excluded_users', query: buildExcludedUsersCTE(exclusions, true, queryParams) });
  }

  // CTE: converted
  const exclAndCondition = exclusions.length > 0
    ? notInExcludedUsers()
    : undefined;

  const convertedNode = select(
    func('divide', func('minus', col('to_step_ms'), col('from_step_ms')), literal(1000.0)).as('duration_seconds'),
  )
    .from('funnel_per_user')
    .where(
      gte(col('max_step'), namedParam('to_step_num', 'UInt64', queryParams.to_step_num)),
      gte(col('to_step_ms'), col('from_step_ms')),
      gt(col('from_step_ms'), literal(0)),
      exclAndCondition,
    )
    .build();

  ctes.push({ name: 'converted', query: convertedNode });

  // Final SELECT
  const durationFilter = and(
    gte(col('duration_seconds'), literal(0)),
    lte(col('duration_seconds'), namedParam('window_seconds', 'Float64', queryParams.window_seconds)),
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

  const rows = await new ChQueryExecutor(ch).rows<TtcAggRow>(finalQuery);
  return parseTtcRows(rows, fromStep, toStep);
}
