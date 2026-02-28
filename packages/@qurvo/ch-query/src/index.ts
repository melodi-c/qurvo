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

// Builders — select builder & set operations
export { select, unionAll, intersect, unionDistinct, SelectBuilder } from './builders';

// Cohort — cohort query builder, validation, helpers
export {
  buildCohortSubquery,
  buildCohortFilterClause,
  extractCohortReferences,
  detectCircularDependency,
  countLeafConditions,
  measureNestingDepth,
  validateDefinitionComplexity,
  MAX_TOTAL_CONDITIONS,
  MAX_NESTING_DEPTH,
  topologicalSortCohorts,
  groupCohortsByLevel,
  CohortQueryValidationError,
  buildOperatorClause as cohortBuildOperatorClause,
  buildEventFilterClauses as cohortBuildEventFilterClauses,
  resolveDateTo as cohortResolveDateTo,
  resolveDateFrom as cohortResolveDateFrom,
  resolvePropertyExpr as cohortResolvePropertyExpr,
  resolveEventPropertyExpr as cohortResolveEventPropertyExpr,
  TOP_LEVEL_COLUMNS,
  RESOLVED_PERSON,
} from './cohort';
export type {
  CohortForSort,
  ToposortResult,
  CohortFilterInput,
  BuildContext,
} from './cohort';
