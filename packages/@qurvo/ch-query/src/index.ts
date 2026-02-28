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

// Builders — select builder
export { select, unionAll, SelectBuilder } from './builders';

// Analytics — domain helpers
export * from './analytics';

// Cohort — cohort query builder, validation, helpers
// Note: selective re-exports to avoid name collisions with analytics module.
// Consumers needing cohort-specific resolvePropertyExpr etc. import from '@qurvo/ch-query/cohort'
// or from the '@qurvo/cohort-query' compat wrapper.
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
  // Cohort-specific helpers (Expr-returning)
  buildOperatorClause as cohortBuildOperatorClause,
  buildEventFilterClauses as cohortBuildEventFilterClauses,
  resolveDateTo as cohortResolveDateTo,
  resolveDateFrom as cohortResolveDateFrom,
  TOP_LEVEL_COLUMNS,
} from './cohort';
export type {
  CohortForSort,
  ToposortResult,
  CohortFilterInput,
  BuildContext,
} from './cohort';
// Re-export cohort's resolvePropertyExpr/resolveEventPropertyExpr under
// namespaced names to avoid collision with analytics.resolvePropertyExpr:
export {
  resolvePropertyExpr as cohortResolvePropertyExpr,
  resolveEventPropertyExpr as cohortResolveEventPropertyExpr,
} from './cohort';
