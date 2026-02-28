// ── Expressions ──

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

export interface FuncCallExpr {
  type: 'func';
  name: string;
  args: Expr[];
  distinct?: boolean;
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
  | '/';

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
  target: SelectNode | Expr;
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

export type Expr =
  | ColumnExpr
  | LiteralExpr
  | ParamExpr
  | RawExpr
  | FuncCallExpr
  | AliasExpr
  | BinaryExpr
  | NotExpr
  | InExpr
  | CaseExpr
  | ArrayJoinExpr
  | SubqueryExpr;

// ── Queries ──

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
  columns: Expr[];
  from?: string | SelectNode;
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

export type QueryNode = SelectNode | UnionAllNode;
