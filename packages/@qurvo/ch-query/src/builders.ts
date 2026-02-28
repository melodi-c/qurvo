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
  LiteralExpr,
  NotExpr,
  ParamExpr,
  QueryNode,
  RawExpr,
  SelectNode,
  SubqueryExpr,
  UnionAllNode,
} from './ast';

// ── Alias helper ──

type WithAlias<T extends Expr> = T & { as(alias: string): AliasExpr };

function withAlias<T extends Expr>(expr: T): WithAlias<T> {
  return Object.assign(expr, {
    as(alias: string): AliasExpr {
      return { type: 'alias' as const, expr, alias };
    },
  });
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

export function func(name: string, ...args: Expr[]): WithAlias<FuncCallExpr> {
  return withAlias({ type: 'func', name, args });
}

export function funcDistinct(name: string, ...args: Expr[]): WithAlias<FuncCallExpr> {
  return withAlias({ type: 'func', name, args, distinct: true });
}

export function subquery(query: SelectNode): WithAlias<SubqueryExpr> {
  return withAlias({ type: 'subquery', query });
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

export function inSubquery(expr: Expr, query: SelectNode): InExpr {
  return { type: 'in', expr, target: query };
}

export function notInSubquery(expr: Expr, query: SelectNode): InExpr {
  return { type: 'in', expr, target: query, negated: true };
}

export function inArray(expr: Expr, arrayParam: ParamExpr): InExpr {
  return { type: 'in', expr, target: arrayParam };
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

  from(table: string | SelectNode, alias?: string): this {
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
