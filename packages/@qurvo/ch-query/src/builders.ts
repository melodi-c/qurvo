import type {
  AliasExpr,
  ArrayJoinExpr,
  BinaryExpr,
  BinaryOp,
  CaseExpr,
  ColumnExpr,
  Expr,
  FuncCallExpr,
  InExpr,
  IntervalExpr,
  LambdaExpr,
  LiteralExpr,
  NamedParamExpr,
  NotExpr,
  ParametricFuncCallExpr,
  ParamExpr,
  QueryNode,
  RawExpr,
  RawWithParamsExpr,
  SelectNode,
  SetOperationNode,
  SubqueryExpr,
  TupleExpr,
  UnionAllNode,
} from './ast';

// ── Validation helpers (shared with compiler.ts — duplicated to keep builders zero-dep on compiler) ──

const VALID_INTERVAL_UNITS = new Set([
  'SECOND', 'MINUTE', 'HOUR', 'DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR',
]);

const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const CH_TYPE_RE = /^[a-zA-Z_][a-zA-Z0-9_]*(\([a-zA-Z0-9_, ]*\))?$/;

// ── Alias helper ──

type WithAlias<T extends Expr> = T & { as(alias: string): AliasExpr };

function withAlias<T extends Expr>(expr: T): WithAlias<T> {
  return Object.assign(expr, {
    as(alias: string): AliasExpr {
      return { type: 'alias' as const, expr, alias };
    },
  });
}

/**
 * Wraps any Expr in an AliasExpr.
 * Useful when the expr doesn't have a built-in .as() method.
 */
export function alias(expr: Expr, name: string): AliasExpr {
  return { type: 'alias', expr, alias: name };
}

// ── Expression factories ──

export function col(name: string): WithAlias<ColumnExpr> {
  return withAlias({ type: 'column', name });
}

export function literal(value: string | number | boolean): WithAlias<LiteralExpr> {
  return withAlias({ type: 'literal', value });
}

export function param(chType: string, value: unknown): WithAlias<ParamExpr> {
  return withAlias({ type: 'param', chType, value });
}

export function raw(sql: string): WithAlias<RawExpr> {
  return withAlias({ type: 'raw', sql });
}

/**
 * Raw SQL with pre-named ClickHouse parameters.
 * The params will be merged into the compilation context when compiled.
 * Used for escape-hatch integrations where external code builds SQL with {name:Type} placeholders.
 */
export function rawWithParams(sql: string, params: Record<string, unknown>): WithAlias<RawWithParamsExpr> {
  return withAlias({ type: 'raw_with_params', sql, params });
}

export function func(name: string, ...args: Expr[]): WithAlias<FuncCallExpr> {
  return withAlias({ type: 'func', name, args });
}

export function funcDistinct(name: string, ...args: Expr[]): WithAlias<FuncCallExpr> {
  return withAlias({ type: 'func', name, args, distinct: true });
}

export function subquery(query: SelectNode): WithAlias<SubqueryExpr> {
  return withAlias({ type: 'subquery', query });
}

/**
 * Tuple expression: tuple(col('a'), col('b')) → (a, b)
 * Used for ClickHouse tuple comparisons, e.g. (project_id, distinct_id) IN subquery.
 */
export function tuple(...elements: Expr[]): WithAlias<TupleExpr> {
  return withAlias({ type: 'tuple', elements });
}

/**
 * Parametric function call: name(params)(args)
 * e.g. parametricFunc('windowFunnel', [literal(86400)], [cond1, cond2])
 *      → windowFunnel(86400)(cond1, cond2)
 */
export function parametricFunc(
  name: string,
  params: Expr[],
  args: Expr[],
): WithAlias<ParametricFuncCallExpr> {
  return withAlias({ type: 'parametric_func', name, params, args });
}

/**
 * Lambda expression: lambda(['x'], body) → x -> body
 * lambda(['x', 'y'], body) → (x, y) -> body
 */
export function lambda(params: string[], body: Expr): LambdaExpr {
  for (const p of params) {
    if (!IDENTIFIER_RE.test(p)) {
      throw new Error(
        `Invalid lambda parameter name: "${p}". Must match /^[a-zA-Z_][a-zA-Z0-9_]*$/.`,
      );
    }
  }
  return { type: 'lambda', params, body };
}

/**
 * INTERVAL value UNIT
 * - interval(7, 'DAY') → INTERVAL 7 DAY (literal number)
 * - interval(namedParam('days', 'UInt32', 7), 'DAY') → INTERVAL {days:UInt32} DAY (Expr)
 */
export function interval(value: number | Expr, unit: string): WithAlias<IntervalExpr> {
  if (!VALID_INTERVAL_UNITS.has(unit)) {
    throw new Error(
      `Invalid interval unit: "${unit}". Allowed units: ${[...VALID_INTERVAL_UNITS].join(', ')}.`,
    );
  }
  return withAlias({ type: 'interval', value, unit });
}

/**
 * Named ClickHouse parameter with explicit name: {key:Type}
 * Unlike param() (auto-incrementing p_N), this uses a caller-chosen name.
 * Useful for cohort builders and other cases where param names must be stable.
 */
export function namedParam(key: string, chType: string, value: unknown): WithAlias<NamedParamExpr> {
  if (!IDENTIFIER_RE.test(key)) {
    throw new Error(
      `Invalid named parameter key: "${key}". Must match /^[a-zA-Z_][a-zA-Z0-9_]*$/.`,
    );
  }
  if (!CH_TYPE_RE.test(chType)) {
    throw new Error(
      `Invalid ClickHouse type: "${chType}". Must match /^[a-zA-Z_][a-zA-Z0-9_]*(\\([a-zA-Z0-9_, ]*\\))?$/.`,
    );
  }
  return withAlias({ type: 'named_param', key, chType, value });
}

// ── Shortcut functions for common ClickHouse functions ──

export function count(): WithAlias<FuncCallExpr> {
  return func('count');
}

export function countDistinct(expr: Expr): WithAlias<FuncCallExpr> {
  return funcDistinct('count', expr);
}

export function countIf(condition: Expr): WithAlias<FuncCallExpr> {
  return func('countIf', condition);
}

export function uniqExact(expr: Expr): WithAlias<FuncCallExpr> {
  return func('uniqExact', expr);
}

export function avg(expr: Expr): WithAlias<FuncCallExpr> {
  return func('avg', expr);
}

export function avgIf(expr: Expr, condition: Expr): WithAlias<FuncCallExpr> {
  return func('avgIf', expr, condition);
}

export function sum(expr: Expr): WithAlias<FuncCallExpr> {
  return func('sum', expr);
}

export function sumIf(expr: Expr, condition: Expr): WithAlias<FuncCallExpr> {
  return func('sumIf', expr, condition);
}

export function min(expr: Expr): WithAlias<FuncCallExpr> {
  return func('min', expr);
}

export function minIf(expr: Expr, condition: Expr): WithAlias<FuncCallExpr> {
  return func('minIf', expr, condition);
}

export function max(expr: Expr): WithAlias<FuncCallExpr> {
  return func('max', expr);
}

export function maxIf(expr: Expr, condition: Expr): WithAlias<FuncCallExpr> {
  return func('maxIf', expr, condition);
}

export function groupArray(expr: Expr): WithAlias<FuncCallExpr> {
  return func('groupArray', expr);
}

export function groupArrayIf(expr: Expr, condition: Expr): WithAlias<FuncCallExpr> {
  return func('groupArrayIf', expr, condition);
}

export function arraySort(expr: Expr): WithAlias<FuncCallExpr> {
  return func('arraySort', expr);
}

export function arrayFilter(lambdaOrStr: LambdaExpr | string, arrayExpr: Expr): WithAlias<FuncCallExpr> {
  if (typeof lambdaOrStr === 'string') {
    return func('arrayFilter', { type: 'raw', sql: lambdaOrStr }, arrayExpr);
  }
  return func('arrayFilter', lambdaOrStr, arrayExpr);
}

export function toString(expr: Expr): WithAlias<FuncCallExpr> {
  return func('toString', expr);
}

// ── JSON functions ──

/** JSONExtractString(expr, key1, key2, ...) — variadic, supports nested keys */
export function jsonExtractString(expr: Expr, ...keys: string[]): WithAlias<FuncCallExpr> {
  return func('JSONExtractString', expr, ...keys.map((k) => literal(k)));
}

/** JSONExtractRaw(expr, key1, key2, ...) — variadic, supports nested keys */
export function jsonExtractRaw(expr: Expr, ...keys: string[]): WithAlias<FuncCallExpr> {
  return func('JSONExtractRaw', expr, ...keys.map((k) => literal(k)));
}

/** JSONHas(expr, key1, key2, ...) — variadic, supports nested keys */
export function jsonHas(expr: Expr, ...keys: string[]): WithAlias<FuncCallExpr> {
  return func('JSONHas', expr, ...keys.map((k) => literal(k)));
}

// ── Type conversion functions ──

export function toFloat64OrZero(expr: Expr): WithAlias<FuncCallExpr> {
  return func('toFloat64OrZero', expr);
}

export function toDate(expr: Expr): WithAlias<FuncCallExpr> {
  return func('toDate', expr);
}

export function toInt64(expr: Expr): WithAlias<FuncCallExpr> {
  return func('toInt64', expr);
}

export function toUInt64(expr: Expr): WithAlias<FuncCallExpr> {
  return func('toUInt64', expr);
}

export function toUnixTimestamp64Milli(expr: Expr): WithAlias<FuncCallExpr> {
  return func('toUnixTimestamp64Milli', expr);
}

export function parseDateTimeBestEffortOrZero(expr: Expr): WithAlias<FuncCallExpr> {
  return func('parseDateTimeBestEffortOrZero', expr);
}

// ── Aggregate functions ──

export function argMax(expr: Expr, orderByExpr: Expr): WithAlias<FuncCallExpr> {
  return func('argMax', expr, orderByExpr);
}

export function argMinIf(expr: Expr, orderByExpr: Expr, condition: Expr): WithAlias<FuncCallExpr> {
  return func('argMinIf', expr, orderByExpr, condition);
}

export function argMaxIf(expr: Expr, orderByExpr: Expr, condition: Expr): WithAlias<FuncCallExpr> {
  return func('argMaxIf', expr, orderByExpr, condition);
}

/**
 * quantile(p)(expr) — parametric aggregate function.
 * e.g. quantile(0.5, col('duration')) → quantile(0.50)(duration)
 */
export function quantile(p: number, expr: Expr): WithAlias<ParametricFuncCallExpr> {
  return parametricFunc('quantile', [literal(p)], [expr]);
}

// ── Dictionary functions ──

export function dictGetOrNull(dictName: string, attrName: string, keyExpr: Expr): WithAlias<FuncCallExpr> {
  return func('dictGetOrNull', literal(dictName), literal(attrName), keyExpr);
}

// ── String functions ──

export function lower(expr: Expr): WithAlias<FuncCallExpr> {
  return func('lower', expr);
}

/** match(expr, pattern) — REGEXP match */
export function match(expr: Expr, pattern: Expr): WithAlias<FuncCallExpr> {
  return func('match', expr, pattern);
}

/** multiSearchAny(expr, arrayExpr) — search for any of the strings in array */
export function multiSearchAny(expr: Expr, arrayExpr: Expr): WithAlias<FuncCallExpr> {
  return func('multiSearchAny', expr, arrayExpr);
}

// ── Array & utility functions ──

/** notEmpty(expr) — returns 1 if array/string is not empty */
export function notEmpty(expr: Expr): WithAlias<FuncCallExpr> {
  return func('notEmpty', expr);
}

/** greatest(expr1, expr2, ...) — returns the maximum across arguments */
export function greatest(...exprs: Expr[]): WithAlias<FuncCallExpr> {
  return func('greatest', ...exprs);
}

/** indexOf(arr, val) — returns 1-based index of val in arr, or 0 if not found */
export function indexOf(arr: Expr, val: Expr): WithAlias<FuncCallExpr> {
  return func('indexOf', arr, val);
}

/** arrayElement(arr, idx) — returns element at 1-based index (equivalent to arr[idx]) */
export function arrayElement(arr: Expr, idx: Expr): WithAlias<FuncCallExpr> {
  return func('arrayElement', arr, idx);
}

/** sipHash64(expr) — SipHash-2-4 hash function returning UInt64 */
export function sipHash64(expr: Expr): WithAlias<FuncCallExpr> {
  return func('sipHash64', expr);
}

// ── Conditional functions ──

/**
 * if(cond, then, else_) — ClickHouse ternary `if` function.
 * Named `ifExpr` to avoid conflict with JS reserved word.
 */
export function ifExpr(cond: Expr, then: Expr, else_: Expr): WithAlias<FuncCallExpr> {
  return func('if', cond, then, else_);
}

/** coalesce(expr1, expr2, ...) — returns the first non-NULL argument */
export function coalesce(...exprs: Expr[]): WithAlias<FuncCallExpr> {
  return func('coalesce', ...exprs);
}

// ── Array functions with lambda support ──

/**
 * arrayExists(lambda, arrayExpr) — returns 1 if at least one element matches.
 * e.g. arrayExists(lambda(['x'], gt(col('x'), literal(0))), col('arr'))
 */
export function arrayExists(lambdaExpr: LambdaExpr, arrayExpr: Expr): WithAlias<FuncCallExpr> {
  return func('arrayExists', lambdaExpr, arrayExpr);
}

/**
 * arrayMin — two signatures:
 * 1. arrayMin(lambda, arrayExpr) — min of lambda applied to each element
 * 2. arrayMin(arrayExpr) — min element of the array (no lambda)
 */
export function arrayMin(arrayExpr: Expr): WithAlias<FuncCallExpr>;
export function arrayMin(lambdaExpr: LambdaExpr, arrayExpr: Expr): WithAlias<FuncCallExpr>;
export function arrayMin(first: Expr, second?: Expr): WithAlias<FuncCallExpr> {
  if (second !== undefined) {
    return func('arrayMin', first, second);
  }
  return func('arrayMin', first);
}

/**
 * arrayMax(lambda, arrayExpr) — returns maximum of lambda applied to each element.
 * e.g. arrayMax(lambda(['x'], col('x')), col('arr'))
 */
export function arrayMax(lambdaExpr: LambdaExpr, arrayExpr: Expr): WithAlias<FuncCallExpr> {
  return func('arrayMax', lambdaExpr, arrayExpr);
}

/**
 * arrayFold(lambda, arrayExpr, initialAcc) — folds array with accumulator.
 * e.g. arrayFold(lambda(['acc', 'x'], add(col('acc'), col('x'))), col('arr'), literal(0))
 *      → arrayFold((acc, x) -> acc + x, arr, 0)
 */
export function arrayFold(lambdaExpr: LambdaExpr, arrayExpr: Expr, initialAcc: Expr): WithAlias<FuncCallExpr> {
  return func('arrayFold', lambdaExpr, arrayExpr, initialAcc);
}

// ── HIGH priority function shortcuts ──

/** length(expr) — returns length of string or array */
export function length(expr: Expr): WithAlias<FuncCallExpr> {
  return func('length', expr);
}

/** toStartOfDay(expr, tz?) — truncate DateTime to start of day */
export function toStartOfDay(expr: Expr, tz?: Expr): WithAlias<FuncCallExpr> {
  return tz ? func('toStartOfDay', expr, tz) : func('toStartOfDay', expr);
}

/** toStartOfHour(expr, tz?) — truncate DateTime to start of hour */
export function toStartOfHour(expr: Expr, tz?: Expr): WithAlias<FuncCallExpr> {
  return tz ? func('toStartOfHour', expr, tz) : func('toStartOfHour', expr);
}

/** toStartOfWeek(expr, mode?, tz?) — truncate Date/DateTime to start of week */
export function toStartOfWeek(expr: Expr, mode?: Expr, tz?: Expr): WithAlias<FuncCallExpr> {
  const args: Expr[] = [expr];
  if (mode !== undefined) args.push(mode);
  if (tz !== undefined) args.push(tz);
  return func('toStartOfWeek', ...args);
}

/** toStartOfMonth(expr, tz?) — truncate Date/DateTime to start of month */
export function toStartOfMonth(expr: Expr, tz?: Expr): WithAlias<FuncCallExpr> {
  return tz ? func('toStartOfMonth', expr, tz) : func('toStartOfMonth', expr);
}

/** toDateTime(...args) — convert to DateTime type */
export function toDateTime(...args: Expr[]): WithAlias<FuncCallExpr> {
  return func('toDateTime', ...args);
}

/** dateDiff(unit, start, end) — difference between two dates/datetimes. Unit can be a string (auto-wrapped in literal()) or an Expr. */
export function dateDiff(unit: string | Expr, start: Expr, end: Expr): WithAlias<FuncCallExpr> {
  const unitExpr = typeof unit === 'string' ? literal(unit) : unit;
  return func('dateDiff', unitExpr, start, end);
}

// ── MEDIUM priority function shortcuts ──

/** toDateTime64(expr, scale, tz?) — convert to DateTime64 with specified scale */
export function toDateTime64(expr: Expr, scale: Expr, tz?: Expr): WithAlias<FuncCallExpr> {
  return tz ? func('toDateTime64', expr, scale, tz) : func('toDateTime64', expr, scale);
}

/** has(arr, elem) — returns 1 if array contains elem */
export function has(arr: Expr, elem: Expr): WithAlias<FuncCallExpr> {
  return func('has', arr, elem);
}

/** any(expr) — returns an arbitrary value from the group */
export function any(expr: Expr): WithAlias<FuncCallExpr> {
  return func('any', expr);
}

/** arraySlice(arr, offset, len?) — extract a slice of an array */
export function arraySlice(arr: Expr, offset: Expr, len?: Expr): WithAlias<FuncCallExpr> {
  return len ? func('arraySlice', arr, offset, len) : func('arraySlice', arr, offset);
}

/** parseDateTimeBestEffort(expr) — parse date/time string with best-effort */
export function parseDateTimeBestEffort(expr: Expr): WithAlias<FuncCallExpr> {
  return func('parseDateTimeBestEffort', expr);
}

/** now64(precision?) — current DateTime64 with optional precision */
export function now64(precision?: Expr): WithAlias<FuncCallExpr> {
  return precision ? func('now64', precision) : func('now64');
}

/** toUInt32(expr) — cast to UInt32 */
export function toUInt32(expr: Expr): WithAlias<FuncCallExpr> {
  return func('toUInt32', expr);
}

/** toInt32(expr) — cast to Int32 */
export function toInt32(expr: Expr): WithAlias<FuncCallExpr> {
  return func('toInt32', expr);
}

// ── LOW priority function shortcuts ──

/** groupUniqArray(expr) — returns array of unique values from the group */
export function groupUniqArray(expr: Expr): WithAlias<FuncCallExpr> {
  return func('groupUniqArray', expr);
}

/** arrayCompact(arr) — removes consecutive duplicate elements */
export function arrayCompact(arr: Expr): WithAlias<FuncCallExpr> {
  return func('arrayCompact', arr);
}

/** arrayEnumerate(arr) — returns [1, 2, 3, ..., length(arr)] */
export function arrayEnumerate(arr: Expr): WithAlias<FuncCallExpr> {
  return func('arrayEnumerate', arr);
}

/** toUUID(expr) — cast to UUID */
export function toUUID(expr: Expr): WithAlias<FuncCallExpr> {
  return func('toUUID', expr);
}

/** today() — returns current date */
export function today(): WithAlias<FuncCallExpr> {
  return func('today');
}

// ── Condition builders ──

function makeBinary(op: BinaryOp, left: Expr, right: Expr): BinaryExpr {
  return { type: 'binary', op, left, right };
}

/**
 * Filter out undefined and false, then combine with AND.
 * Returns the single expr if only one remains after filtering.
 */
export function and(...exprs: (Expr | undefined | false)[]): Expr {
  const filtered = exprs.filter(
    (e): e is Expr => e !== undefined && e !== false,
  );
  if (filtered.length === 0) {
    // Edge case: everything filtered out — return trivial true
    return { type: 'literal', value: 1 };
  }
  if (filtered.length === 1) return filtered[0];
  return filtered.slice(1).reduce<Expr>((acc, e) => makeBinary('AND', acc, e), filtered[0]);
}

/**
 * Filter out undefined and false, then combine with OR.
 * Returns the single expr if only one remains after filtering.
 */
export function or(...exprs: (Expr | undefined | false)[]): Expr {
  const filtered = exprs.filter(
    (e): e is Expr => e !== undefined && e !== false,
  );
  if (filtered.length === 0) {
    return { type: 'literal', value: 0 };
  }
  if (filtered.length === 1) return filtered[0];
  return filtered.slice(1).reduce<Expr>((acc, e) => makeBinary('OR', acc, e), filtered[0]);
}

export function eq(left: Expr, right: Expr): BinaryExpr {
  return makeBinary('=', left, right);
}

export function neq(left: Expr, right: Expr): BinaryExpr {
  return makeBinary('!=', left, right);
}

export function gt(left: Expr, right: Expr): BinaryExpr {
  return makeBinary('>', left, right);
}

export function gte(left: Expr, right: Expr): BinaryExpr {
  return makeBinary('>=', left, right);
}

export function lt(left: Expr, right: Expr): BinaryExpr {
  return makeBinary('<', left, right);
}

export function lte(left: Expr, right: Expr): BinaryExpr {
  return makeBinary('<=', left, right);
}

export function like(left: Expr, right: Expr): BinaryExpr {
  return makeBinary('LIKE', left, right);
}

export function notLike(left: Expr, right: Expr): BinaryExpr {
  return makeBinary('NOT LIKE', left, right);
}

export function not(expr: Expr): NotExpr {
  return { type: 'not', expr };
}

export function add(left: Expr, right: Expr): WithAlias<BinaryExpr> {
  return withAlias(makeBinary('+', left, right));
}

export function sub(left: Expr, right: Expr): WithAlias<BinaryExpr> {
  return withAlias(makeBinary('-', left, right));
}

export function mul(left: Expr, right: Expr): WithAlias<BinaryExpr> {
  return withAlias(makeBinary('*', left, right));
}

export function div(left: Expr, right: Expr): WithAlias<BinaryExpr> {
  return withAlias(makeBinary('/', left, right));
}

export function mod(left: Expr, right: Expr): WithAlias<BinaryExpr> {
  return withAlias(makeBinary('%', left, right));
}

export function inSubquery(expr: Expr, query: QueryNode): InExpr {
  return { type: 'in', expr, target: query };
}

export function notInSubquery(expr: Expr, query: QueryNode): InExpr {
  return { type: 'in', expr, target: query, negated: true };
}

export function inArray(expr: Expr, arrayParam: Expr): InExpr {
  return { type: 'in', expr, target: arrayParam };
}

export function notInArray(expr: Expr, arrayParam: Expr): InExpr {
  return { type: 'in', expr, target: arrayParam, negated: true };
}

export function multiIf(
  branches: Array<{ condition: Expr; result: Expr }>,
  elseResult: Expr,
): WithAlias<CaseExpr> {
  return withAlias({ type: 'case', branches, else_result: elseResult });
}

// ── SQL utils (LIKE escaping) ──

/**
 * Escapes LIKE-wildcard characters (%, _, \) in a user-provided string
 * so they are treated as literals in SQL LIKE / ILIKE patterns.
 */
export function escapeLikePattern(s: string): string {
  return s.replace(/[\\%_]/g, (ch) => '\\' + ch);
}

export type SafeLikeMode = 'contains' | 'startsWith' | 'endsWith';

/** Wrap an escaped LIKE pattern according to the search mode */
function wrapLikePattern(escaped: string, mode: SafeLikeMode): string {
  switch (mode) {
    case 'contains':
      return `%${escaped}%`;
    case 'startsWith':
      return `${escaped}%`;
    case 'endsWith':
      return `%${escaped}`;
  }
}

/**
 * Safe LIKE: escapes user input and wraps according to `mode`, producing:
 * `expr LIKE {p_N:String}` with the value properly escaped.
 *
 * @param mode - 'contains' (default) wraps `%val%`, 'startsWith' wraps `val%`, 'endsWith' wraps `%val`
 */
export function safeLike(expr: Expr, substring: string, mode: SafeLikeMode = 'contains'): BinaryExpr {
  const escaped = wrapLikePattern(escapeLikePattern(substring), mode);
  return like(expr, param('String', escaped));
}

/**
 * Safe NOT LIKE: escapes user input and wraps according to `mode`, producing:
 * `expr NOT LIKE {p_N:String}` with the value properly escaped.
 *
 * @param mode - 'contains' (default) wraps `%val%`, 'startsWith' wraps `val%`, 'endsWith' wraps `%val`
 */
export function safeNotLike(expr: Expr, substring: string, mode: SafeLikeMode = 'contains'): BinaryExpr {
  const escaped = wrapLikePattern(escapeLikePattern(substring), mode);
  return notLike(expr, param('String', escaped));
}

// ── SelectBuilder (fluent chain) ──

export class SelectBuilder {
  private node: Partial<SelectNode> & { type: 'select'; columns: Expr[] };

  constructor(columns: Expr[]) {
    this.node = { type: 'select', columns };
  }

  distinct(): this {
    this.node.distinct = true;
    return this;
  }

  from(table: string | QueryNode, alias?: string): this {
    this.node.from = table;
    if (alias) this.node.fromAlias = alias;
    return this;
  }

  join(
    type: 'INNER' | 'LEFT' | 'CROSS',
    table: string | SelectNode,
    alias?: string,
    on?: Expr,
  ): this {
    if (!this.node.joins) this.node.joins = [];
    this.node.joins.push({ type, table, alias, on });
    return this;
  }

  crossJoin(query: SelectNode, alias?: string): this {
    return this.join('CROSS', query, alias);
  }

  innerJoin(table: string | SelectNode, alias: string, on: Expr): this {
    return this.join('INNER', table, alias, on);
  }

  leftJoin(table: string | SelectNode, alias: string, on: Expr): this {
    return this.join('LEFT', table, alias, on);
  }

  where(...conditions: (Expr | undefined | false)[]): this {
    const combined = and(...conditions);
    this.node.where = combined;
    return this;
  }

  prewhere(...conditions: (Expr | undefined | false)[]): this {
    const combined = and(...conditions);
    this.node.prewhere = combined;
    return this;
  }

  groupBy(...exprs: Expr[]): this {
    this.node.groupBy = exprs;
    return this;
  }

  having(condition: Expr): this {
    this.node.having = condition;
    return this;
  }

  orderBy(expr: Expr, dir: 'ASC' | 'DESC' = 'ASC'): this {
    if (!this.node.orderBy) this.node.orderBy = [];
    this.node.orderBy.push({ expr, direction: dir });
    return this;
  }

  limit(n: number): this {
    this.node.limit = n;
    return this;
  }

  offset(n: number): this {
    this.node.offset = n;
    return this;
  }

  with(name: string, query: QueryNode): this {
    if (!this.node.ctes) this.node.ctes = [];
    this.node.ctes.push({ name, query });
    return this;
  }

  withAll(ctes: Array<{ name: string; query: QueryNode }>): this {
    if (!this.node.ctes) this.node.ctes = [];
    this.node.ctes.push(...ctes);
    return this;
  }

  arrayJoin(arrayExpr: Expr, itemAlias: string): this {
    if (!this.node.arrayJoins) this.node.arrayJoins = [];
    const aj: ArrayJoinExpr = { type: 'array_join', arrayExpr, itemAlias };
    this.node.arrayJoins.push(aj);
    return this;
  }

  /**
   * Append columns to the existing SELECT list.
   * Undefined values are silently skipped (convenient for conditional columns).
   */
  addSelect(...cols: (Expr | undefined)[]): this {
    for (const c of cols) {
      if (c !== undefined) this.node.columns.push(c);
    }
    return this;
  }

  /**
   * AND additional conditions to the existing WHERE clause.
   * If WHERE is empty, sets it. Undefined values are silently skipped.
   */
  addWhere(...conditions: (Expr | undefined)[]): this {
    const filtered = conditions.filter((c): c is Expr => c !== undefined);
    if (filtered.length === 0) return this;
    const combined = filtered.length === 1 ? filtered[0] : and(...filtered);
    this.node.where = this.node.where ? and(this.node.where, combined) : combined;
    return this;
  }

  /**
   * Append expressions to the existing GROUP BY list.
   * Undefined values are silently skipped.
   */
  addGroupBy(...exprs: (Expr | undefined)[]): this {
    for (const e of exprs) {
      if (e !== undefined) {
        if (!this.node.groupBy) this.node.groupBy = [];
        this.node.groupBy.push(e);
      }
    }
    return this;
  }

  /**
   * AND an additional condition to the existing HAVING clause.
   * If HAVING is empty, sets it.
   */
  addHaving(condition: Expr): this {
    this.node.having = this.node.having ? and(this.node.having, condition) : condition;
    return this;
  }

  /**
   * Create an independent deep copy of this builder.
   * Mutations on the clone do not affect the original and vice versa.
   *
   * Uses JSON round-trip instead of structuredClone because AST nodes
   * may carry non-cloneable `.as()` helper methods from `withAlias()`.
   */
  clone(): SelectBuilder {
    const copy = new SelectBuilder([]);
    copy.node = JSON.parse(JSON.stringify(this.node));
    return copy;
  }

  build(): SelectNode {
    return this.node as SelectNode;
  }
}

export function select(...columns: Expr[]): SelectBuilder {
  return new SelectBuilder(columns);
}

export function unionAll(...queries: QueryNode[]): UnionAllNode {
  return { type: 'union_all', queries };
}

export function intersect(...queries: QueryNode[]): SetOperationNode {
  return { type: 'set_operation', operator: 'INTERSECT', queries };
}

export function unionDistinct(...queries: QueryNode[]): SetOperationNode {
  return { type: 'set_operation', operator: 'UNION DISTINCT', queries };
}

export function except(...queries: QueryNode[]): SetOperationNode {
  return { type: 'set_operation', operator: 'EXCEPT', queries };
}
