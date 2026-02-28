// AST types
export type {
  ColumnExpr,
  LiteralExpr,
  ParamExpr,
  RawExpr,
  RawWithParamsExpr,
  FuncCallExpr,
  AliasExpr,
  BinaryOp,
  BinaryExpr,
  NotExpr,
  InExpr,
  CaseExpr,
  ArrayJoinExpr,
  SubqueryExpr,
  Expr,
  OrderByItem,
  JoinClause,
  SelectNode,
  UnionAllNode,
  QueryNode,
} from './ast';

// Compiler
export { compile, compileExprToSql } from './compiler';
export type { CompiledQuery } from './compiler';

// Builders — expression factories
export {
  alias,
  col,
  literal,
  param,
  raw,
  rawWithParams,
  func,
  funcDistinct,
  subquery,
} from './builders';

// Builders — shortcut functions
export {
  count,
  countDistinct,
  countIf,
  uniqExact,
  avg,
  avgIf,
  sum,
  sumIf,
  min,
  minIf,
  max,
  maxIf,
  groupArray,
  groupArrayIf,
  arraySort,
  arrayFilter,
  toString,
} from './builders';

// Builders — condition builders
export {
  and,
  or,
  eq,
  neq,
  gt,
  gte,
  lt,
  lte,
  like,
  notLike,
  not,
  add,
  sub,
  mul,
  div,
  inSubquery,
  notInSubquery,
  inArray,
  notInArray,
  multiIf,
} from './builders';

// Builders — select builder
export { select, unionAll, SelectBuilder } from './builders';

// Analytics — domain helpers
export * from './analytics';
