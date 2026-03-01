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

/** INTERVAL N UNIT — e.g. interval(7, 'DAY') → INTERVAL 7 DAY */
export function interval(value: number, unit: string): WithAlias<IntervalExpr> {
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

export function arrayFilter(lambda: string, arrayExpr: Expr): WithAlias<FuncCallExpr> {
  // lambda is passed as raw SQL: e.g. "x -> x > 0"
  return func('arrayFilter', { type: 'raw', sql: lambda }, arrayExpr);
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

export function parseDateTimeBestEffortOrZero(expr: Expr): WithAlias<FuncCallExpr> {
  return func('parseDateTimeBestEffortOrZero', expr);
}

// ── Aggregate functions ──

export function argMax(expr: Expr, orderByExpr: Expr): WithAlias<FuncCallExpr> {
  return func('argMax', expr, orderByExpr);
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

// ── Conditional functions ──

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
 * arrayMax(lambda, arrayExpr) — returns maximum of lambda applied to each element.
 * e.g. arrayMax(lambda(['x'], col('x')), col('arr'))
 */
export function arrayMax(lambdaExpr: LambdaExpr, arrayExpr: Expr): WithAlias<FuncCallExpr> {
  return func('arrayMax', lambdaExpr, arrayExpr);
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

export function inSubquery(expr: Expr, query: SelectNode): InExpr {
  return { type: 'in', expr, target: query };
}

export function notInSubquery(expr: Expr, query: SelectNode): InExpr {
  return { type: 'in', expr, target: query, negated: true };
}

export function inArray(expr: Expr, arrayParam: ParamExpr): InExpr {
  return { type: 'in', expr, target: arrayParam };
}

export function notInArray(expr: Expr, arrayParam: ParamExpr): InExpr {
  return { type: 'in', expr, target: arrayParam, negated: true };
}

export function multiIf(
  branches: Array<{ condition: Expr; result: Expr }>,
  elseResult: Expr,
): WithAlias<CaseExpr> {
  return withAlias({ type: 'case', branches, else_result: elseResult });
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

  from(table: string, opts: { final?: boolean; alias?: string }): this;
  from(table: string | QueryNode, alias?: string): this;
  from(
    table: string | QueryNode,
    aliasOrOpts?: string | { final?: boolean; alias?: string },
  ): this {
    this.node.from = table;
    if (typeof aliasOrOpts === 'string') {
      this.node.fromAlias = aliasOrOpts;
    } else if (aliasOrOpts) {
      if (aliasOrOpts.alias) this.node.fromAlias = aliasOrOpts.alias;
      if (aliasOrOpts.final) this.node.final = true;
    }
    return this;
  }

  /** Appends FINAL modifier to the FROM clause (only valid for table names, not subqueries) */
  final(): this {
    this.node.final = true;
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
