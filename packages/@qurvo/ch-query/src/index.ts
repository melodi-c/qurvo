// AST types
export type {
  ColumnExpr,
  LiteralExpr,
  ParamExpr,
  RawExpr,
  RawWithParamsExpr,
  FuncCallExpr,
  ParametricFuncCallExpr,
  LambdaExpr,
  IntervalExpr,
  NamedParamExpr,
  AliasExpr,
  BinaryOp,
  BinaryExpr,
  NotExpr,
  InExpr,
  CaseExpr,
  ArrayJoinExpr,
  SubqueryExpr,
  TupleExpr,
  Expr,
  OrderByItem,
  JoinClause,
  SelectNode,
  UnionAllNode,
  SetOperationNode,
  QueryNode,
} from './ast';

// Compiler
export { compile, compileExprToSql, CompilerContext } from './compiler';
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
  tuple,
  parametricFunc,
  lambda,
  interval,
  namedParam,
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

// Builders — ClickHouse functions
export {
  jsonExtractString,
  jsonExtractRaw,
  jsonHas,
  toFloat64OrZero,
  toDate,
  toInt64,
  toUInt64,
  toUnixTimestamp64Milli,
  parseDateTimeBestEffortOrZero,
  argMax,
  argMinIf,
  argMaxIf,
  quantile,
  dictGetOrNull,
  lower,
  match,
  multiSearchAny,
  notEmpty,
  greatest,
  indexOf,
  arrayElement,
  sipHash64,
  ifExpr,
  coalesce,
  arrayExists,
  arrayMin,
  arrayMax,
  arrayFold,
} from './builders';

// Builders — new function shortcuts (HIGH priority)
export {
  length,
  toStartOfDay,
  toStartOfHour,
  toStartOfWeek,
  toStartOfMonth,
  toDateTime,
  dateDiff,
} from './builders';

// Builders — new function shortcuts (MEDIUM priority)
export {
  toDateTime64,
  has,
  any,
  arraySlice,
  parseDateTimeBestEffort,
  now64,
  toUInt32,
  toInt32,
} from './builders';

// Builders — new function shortcuts (LOW priority)
export {
  groupUniqArray,
  arrayCompact,
  arrayEnumerate,
  toUUID,
  today,
} from './builders';

// Builders — SQL utils
export {
  escapeLikePattern,
  like,
  notLike,
} from './builders';
export type { LikeMode } from './builders';

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
  not,
  add,
  sub,
  mul,
  div,
  mod,
  inSubquery,
  notInSubquery,
  inArray,
  notInArray,
  multiIf,
} from './builders';

// Builders — select builder & set operations
export { select, unionAll, intersect, unionDistinct, except, SelectBuilder } from './builders';
