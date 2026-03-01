import type {
  ArrayJoinExpr,
  BinaryExpr,
  CaseExpr,
  Expr,
  FuncCallExpr,
  InExpr,
  IntervalExpr,
  JoinClause,
  LambdaExpr,
  NamedParamExpr,
  ParametricFuncCallExpr,
  QueryNode,
  SelectNode,
  SetOperationNode,
  TupleExpr,
  UnionAllNode,
} from './ast';

export interface CompiledQuery {
  sql: string;
  params: Record<string, unknown>;
}

export class CompilerContext {
  private params: Record<string, unknown> = {};
  private counter = 0;

  /** Register a value and return the `{p_N:ChType}` placeholder */
  addParam(value: unknown, chType: string): string {
    const name = `p_${this.counter++}`;
    this.params[name] = value;
    return `{${name}:${chType}}`;
  }

  /** Merge pre-named params (e.g. from RawWithParamsExpr) into the context */
  mergeParams(params: Record<string, unknown>): void {
    Object.assign(this.params, params);
  }

  getParams(): Record<string, unknown> {
    return { ...this.params };
  }
}

// ── Validation helpers ──

const VALID_INTERVAL_UNITS = new Set([
  'SECOND', 'MINUTE', 'HOUR', 'DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR',
]);

/** Only alphanumeric + underscore, must start with a letter or underscore */
const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * ClickHouse type names: alphanumeric, underscore, and parentheses for
 * parameterised types like Array(String), Nullable(UInt64), DateTime64(3).
 * Also allows commas and spaces inside parens for multi-param types.
 */
const CH_TYPE_RE = /^[a-zA-Z_][a-zA-Z0-9_]*(\([a-zA-Z0-9_, ]*\))?$/;

// ── Expression compiler ──

function compileLiteral(value: string | number | boolean): string {
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'number') return String(value);
  // String literals are single-quoted with basic escaping
  return `'${String(value).replace(/'/g, "\\'")}'`;
}

/**
 * Flatten nested AND/OR chains into a flat list.
 * e.g. and(and(a, b), c) => [a, b, c]
 */
function flattenBinaryChain(expr: BinaryExpr, ctx: CompilerContext): string {
  const op = expr.op;
  const parts: string[] = [];

  function collect(e: Expr): void {
    if (e.type === 'binary' && e.op === op) {
      collect(e.left);
      collect(e.right);
    } else {
      parts.push(compileExpr(e, ctx));
    }
  }

  collect(expr.left);
  collect(expr.right);

  const separator = ` ${op} `;
  // Wrap OR operands in parens when mixed with AND at a higher level is handled by
  // the caller — here we just join flatly.
  return parts.join(separator);
}

function compileFuncCall(expr: FuncCallExpr, ctx: CompilerContext): string {
  const args = expr.args.map((a) => compileExpr(a, ctx)).join(', ');
  if (expr.distinct) {
    return `${expr.name}(DISTINCT ${args})`;
  }
  return `${expr.name}(${args})`;
}

function compileParametricFuncCall(expr: ParametricFuncCallExpr, ctx: CompilerContext): string {
  const params = expr.params.map((p) => compileExpr(p, ctx)).join(', ');
  const args = expr.args.map((a) => compileExpr(a, ctx)).join(', ');
  return `${expr.name}(${params})(${args})`;
}

function compileLambda(expr: LambdaExpr, ctx: CompilerContext): string {
  for (const p of expr.params) {
    if (!IDENTIFIER_RE.test(p)) {
      throw new Error(
        `Invalid lambda parameter name: "${p}". Must match /^[a-zA-Z_][a-zA-Z0-9_]*$/.`,
      );
    }
  }
  const body = compileExpr(expr.body, ctx);
  if (expr.params.length === 1) {
    return `${expr.params[0]} -> ${body}`;
  }
  return `(${expr.params.join(', ')}) -> ${body}`;
}

function compileInterval(expr: IntervalExpr, ctx: CompilerContext): string {
  if (!VALID_INTERVAL_UNITS.has(expr.unit)) {
    throw new Error(
      `Invalid interval unit: "${expr.unit}". Allowed units: ${[...VALID_INTERVAL_UNITS].join(', ')}.`,
    );
  }
  if (typeof expr.value === 'number') {
    return `INTERVAL ${expr.value} ${expr.unit}`;
  }
  return `INTERVAL ${compileExpr(expr.value, ctx)} ${expr.unit}`;
}

function compileNamedParam(expr: NamedParamExpr, ctx: CompilerContext): string {
  if (!IDENTIFIER_RE.test(expr.key)) {
    throw new Error(
      `Invalid named parameter key: "${expr.key}". Must match /^[a-zA-Z_][a-zA-Z0-9_]*$/.`,
    );
  }
  if (!CH_TYPE_RE.test(expr.chType)) {
    throw new Error(
      `Invalid ClickHouse type: "${expr.chType}". Must match /^[a-zA-Z_][a-zA-Z0-9_]*(\([a-zA-Z0-9_, ]*\))?$/.`,
    );
  }
  ctx.mergeParams({ [expr.key]: expr.value });
  return `{${expr.key}:${expr.chType}}`;
}

function compileBinary(expr: BinaryExpr, ctx: CompilerContext): string {
  const op = expr.op;

  // Flatten AND/OR chains
  if (op === 'AND' || op === 'OR') {
    return flattenBinaryChain(expr, ctx);
  }

  const left = compileExpr(expr.left, ctx);
  const right = compileExpr(expr.right, ctx);
  return `${left} ${op} ${right}`;
}

function compileIn(expr: InExpr, ctx: CompilerContext): string {
  const left = compileExpr(expr.expr, ctx);
  const keyword = expr.negated ? 'NOT IN' : 'IN';

  // target can be a QueryNode (select, union_all, set_operation) or an Expr (e.g. array param)
  if ('type' in expr.target && (expr.target.type === 'select' || expr.target.type === 'union_all' || expr.target.type === 'set_operation')) {
    const subSql = compileQuery(expr.target as QueryNode, ctx);
    return `${left} ${keyword} (${subSql})`;
  }

  const targetSql = compileExpr(expr.target as Expr, ctx);
  return `${left} ${keyword} (${targetSql})`;
}

function compileCase(expr: CaseExpr, ctx: CompilerContext): string {
  const args: string[] = [];
  for (const branch of expr.branches) {
    args.push(compileExpr(branch.condition, ctx));
    args.push(compileExpr(branch.result, ctx));
  }
  args.push(compileExpr(expr.else_result, ctx));
  return `multiIf(${args.join(', ')})`;
}

function compileArrayJoin(expr: ArrayJoinExpr, ctx: CompilerContext): string {
  return `${compileExpr(expr.arrayExpr, ctx)} AS ${expr.itemAlias}`;
}

function compileTuple(expr: TupleExpr, ctx: CompilerContext): string {
  const elements = expr.elements.map((e) => compileExpr(e, ctx)).join(', ');
  return `(${elements})`;
}

function compileExpr(expr: Expr, ctx: CompilerContext): string {
  switch (expr.type) {
    case 'column':
      return expr.name;
    case 'literal':
      return compileLiteral(expr.value);
    case 'param':
      return ctx.addParam(expr.value, expr.chType);
    case 'raw':
      return expr.sql;
    case 'raw_with_params':
      ctx.mergeParams(expr.params);
      return expr.sql;
    case 'func':
      return compileFuncCall(expr, ctx);
    case 'parametric_func':
      return compileParametricFuncCall(expr, ctx);
    case 'lambda':
      return compileLambda(expr, ctx);
    case 'interval':
      return compileInterval(expr, ctx);
    case 'named_param':
      return compileNamedParam(expr, ctx);
    case 'alias':
      return `${compileExpr(expr.expr, ctx)} AS ${expr.alias}`;
    case 'binary':
      return compileBinary(expr, ctx);
    case 'not':
      return `NOT ${compileExpr(expr.expr, ctx)}`;
    case 'in':
      return compileIn(expr, ctx);
    case 'case':
      return compileCase(expr, ctx);
    case 'array_join':
      return compileArrayJoin(expr, ctx);
    case 'subquery':
      return `(${compileQuery(expr.query, ctx)})`;
    case 'tuple':
      return compileTuple(expr, ctx);
  }
}

// ── Query compiler ──

function compileJoin(join: JoinClause, ctx: CompilerContext): string {
  const joinType = join.type === 'CROSS' ? 'CROSS JOIN' : `${join.type} JOIN`;
  const tableSql =
    typeof join.table === 'string'
      ? join.table
      : `(${compileQuery(join.table, ctx)})`;
  const aliasPart = join.alias ? ` AS ${join.alias}` : '';
  const onPart = join.on ? ` ON ${compileExpr(join.on, ctx)}` : '';
  return `${joinType} ${tableSql}${aliasPart}${onPart}`;
}

function compileSelect(node: SelectNode, ctx: CompilerContext): string {
  const parts: string[] = [];

  // CTEs
  if (node.ctes && node.ctes.length > 0) {
    const cteParts = node.ctes.map(
      (c) => `${c.name} AS (${compileQuery(c.query, ctx)})`,
    );
    parts.push(`WITH\n  ${cteParts.join(',\n  ')}`);
  }

  // SELECT
  const selectKeyword = node.distinct ? 'SELECT DISTINCT' : 'SELECT';
  parts.push(
    `${selectKeyword}\n  ${node.columns.map((c) => compileExpr(c, ctx)).join(',\n  ')}`,
  );

  // FROM
  if (node.from !== undefined) {
    const fromSql =
      typeof node.from === 'string'
        ? node.from
        : `(${compileQuery(node.from, ctx)})`;
    parts.push(
      `FROM ${fromSql}${node.fromAlias ? ` AS ${node.fromAlias}` : ''}`,
    );
  }

  // ARRAY JOIN
  if (node.arrayJoins && node.arrayJoins.length > 0) {
    for (const aj of node.arrayJoins) {
      parts.push(
        `ARRAY JOIN ${compileExpr(aj.arrayExpr, ctx)} AS ${aj.itemAlias}`,
      );
    }
  }

  // JOINs
  if (node.joins && node.joins.length > 0) {
    for (const join of node.joins) {
      parts.push(compileJoin(join, ctx));
    }
  }

  // PREWHERE
  if (node.prewhere) {
    parts.push(`PREWHERE ${compileExpr(node.prewhere, ctx)}`);
  }

  // WHERE
  if (node.where) {
    parts.push(`WHERE ${compileExpr(node.where, ctx)}`);
  }

  // GROUP BY
  if (node.groupBy && node.groupBy.length > 0) {
    parts.push(
      `GROUP BY ${node.groupBy.map((e) => compileExpr(e, ctx)).join(', ')}`,
    );
  }

  // HAVING
  if (node.having) {
    parts.push(`HAVING ${compileExpr(node.having, ctx)}`);
  }

  // ORDER BY
  if (node.orderBy && node.orderBy.length > 0) {
    parts.push(
      `ORDER BY ${node.orderBy.map((o) => `${compileExpr(o.expr, ctx)} ${o.direction}`).join(', ')}`,
    );
  }

  // LIMIT
  if (node.limit !== undefined) {
    let limitPart = `LIMIT ${node.limit}`;
    if (node.offset !== undefined) {
      limitPart += ` OFFSET ${node.offset}`;
    }
    parts.push(limitPart);
  }

  return parts.join('\n');
}

function compileUnionAll(node: UnionAllNode, ctx: CompilerContext): string {
  return node.queries.map((q) => compileQuery(q, ctx)).join('\nUNION ALL\n');
}

function compileSetOperation(node: SetOperationNode, ctx: CompilerContext): string {
  return node.queries.map((q) => compileQuery(q, ctx)).join(`\n${node.operator}\n`);
}

function compileQuery(node: QueryNode, ctx: CompilerContext): string {
  switch (node.type) {
    case 'select':
      return compileSelect(node, ctx);
    case 'union_all':
      return compileUnionAll(node, ctx);
    case 'set_operation':
      return compileSetOperation(node, ctx);
  }
}

// ── Public API ──

export function compile(node: QueryNode): CompiledQuery {
  const ctx = new CompilerContext();
  const sql = compileQuery(node, ctx);
  return { sql, params: ctx.getParams() };
}

/**
 * Compile a standalone Expr to a SQL string and collect its params.
 *
 * This is a bridge for code that still builds raw SQL strings (e.g. funnel CTEs)
 * but wants to use ch-query Expr nodes for individual clauses (property filters,
 * cohort filters, resolvePropertyExpr, etc.).
 *
 * An optional `targetParams` object can be passed to merge the compiled params into
 * (avoids the caller having to do `Object.assign` manually). The params are also
 * returned in the result.
 *
 * An optional `ctx` (CompilerContext) can be passed to share the param counter across
 * multiple calls — prevents p_0 collisions when compiling multiple expressions for
 * the same query (e.g. per funnel step, per exclusion).
 */
export function compileExprToSql(
  expr: Expr,
  targetParams?: Record<string, unknown>,
  ctx?: CompilerContext,
): { sql: string; params: Record<string, unknown> } {
  const effectiveCtx = ctx ?? new CompilerContext();
  const sql = compileExpr(expr, effectiveCtx);
  const params = effectiveCtx.getParams();
  if (targetParams) {
    Object.assign(targetParams, params);
  }
  return { sql, params };
}
