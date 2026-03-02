// Expressions

export interface ColumnExpr {
  type: 'column';
  name: string;
}

export interface LiteralExpr {
  type: 'literal';
  value: string | number | boolean;
}

/** ClickHouse named parameter: {name:Type} */
export interface ParamExpr {
  type: 'param';
  chType: string;
  value: unknown;
}

/** Raw SQL escape-hatch — compiler passes through as-is */
export interface RawExpr {
  type: 'raw';
  sql: string;
}

/**
 * Raw SQL with embedded named parameters.
 * Used for escape-hatch integrations (e.g. cohort-query) where the SQL string
 * contains ClickHouse {name:Type} placeholders and the corresponding values
 * must be passed through the compilation pipeline.
 */
export interface RawWithParamsExpr {
  type: 'raw_with_params';
  sql: string;
  params: Record<string, unknown>;
}

export interface FuncCallExpr {
  type: 'func';
  name: string;
  args: Expr[];
  distinct?: boolean;
}

/**
 * Parametric function call: name(params)(args)
 * e.g. windowFunnel(86400, 'strict_order')(cond1, cond2)
 *      quantile(0.5)(expr)
 *      groupArray(100)(expr)
 */
export interface ParametricFuncCallExpr {
  type: 'parametric_func';
  name: string;
  params: Expr[];
  args: Expr[];
}

/** Lambda expression: (x, y) -> body  or  x -> body */
export interface LambdaExpr {
  type: 'lambda';
  params: string[];
  body: Expr;
}

/** INTERVAL N UNIT — e.g. INTERVAL 7 DAY, or INTERVAL expr DAY */
export interface IntervalExpr {
  type: 'interval';
  value: number | Expr;
  unit: string;
}

/**
 * Named ClickHouse parameter with explicit name: {key:Type}
 * Unlike ParamExpr (auto-incrementing p_N), this uses a caller-chosen name.
 */
export interface NamedParamExpr {
  type: 'named_param';
  key: string;
  chType: string;
  value: unknown;
}

export interface AliasExpr {
  type: 'alias';
  expr: Expr;
  alias: string;
}

export type BinaryOp =
  | '='
  | '!='
  | '>'
  | '>='
  | '<'
  | '<='
  | 'AND'
  | 'OR'
  | 'LIKE'
  | 'NOT LIKE'
  | '+'
  | '-'
  | '*'
  | '/'
  | '%';

export interface BinaryExpr {
  type: 'binary';
  op: BinaryOp;
  left: Expr;
  right: Expr;
}

export interface NotExpr {
  type: 'not';
  expr: Expr;
}

export interface InExpr {
  type: 'in';
  expr: Expr;
  target: QueryNode | Expr;
  negated?: boolean;
}

/** multiIf(cond1, val1, cond2, val2, ..., default) */
export interface CaseExpr {
  type: 'case';
  branches: Array<{ condition: Expr; result: Expr }>;
  else_result: Expr;
}

/** ARRAY JOIN arrayExpr AS itemAlias */
export interface ArrayJoinExpr {
  type: 'array_join';
  arrayExpr: Expr;
  itemAlias: string;
}

export interface SubqueryExpr {
  type: 'subquery';
  query: SelectNode;
}

/** Tuple expression: (expr1, expr2, ...) */
export interface TupleExpr {
  type: 'tuple';
  elements: Expr[];
}

export type Expr =
  | ColumnExpr
  | LiteralExpr
  | ParamExpr
  | RawExpr
  | RawWithParamsExpr
  | FuncCallExpr
  | ParametricFuncCallExpr
  | LambdaExpr
  | IntervalExpr
  | NamedParamExpr
  | AliasExpr
  | BinaryExpr
  | NotExpr
  | InExpr
  | CaseExpr
  | ArrayJoinExpr
  | SubqueryExpr
  | TupleExpr;

// Queries

export interface OrderByItem {
  expr: Expr;
  direction: 'ASC' | 'DESC';
}

export interface JoinClause {
  type: 'INNER' | 'LEFT' | 'CROSS';
  table: string | SelectNode;
  alias?: string;
  on?: Expr;
}

export interface SelectNode {
  type: 'select';
  distinct?: boolean;
  final?: boolean;
  columns: Expr[];
  from?: string | QueryNode;
  fromAlias?: string;
  joins?: JoinClause[];
  where?: Expr;
  prewhere?: Expr;
  groupBy?: Expr[];
  having?: Expr;
  orderBy?: OrderByItem[];
  limit?: number;
  offset?: number;
  ctes?: Array<{ name: string; query: QueryNode }>;
  arrayJoins?: ArrayJoinExpr[];
}

export interface UnionAllNode {
  type: 'union_all';
  queries: QueryNode[];
}

/**
 * Generic set operation node: INTERSECT, UNION DISTINCT, EXCEPT, etc.
 * Used by cohort group builders for AND (INTERSECT) and OR (UNION DISTINCT) groups.
 */
export interface SetOperationNode {
  type: 'set_operation';
  operator: 'INTERSECT' | 'UNION DISTINCT' | 'EXCEPT';
  queries: QueryNode[];
}

export type QueryNode = SelectNode | UnionAllNode | SetOperationNode;
