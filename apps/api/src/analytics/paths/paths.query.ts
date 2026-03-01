import type { ClickHouseClient } from '@qurvo/clickhouse';
import { ChQueryExecutor } from '@qurvo/clickhouse';
import type { CohortFilterInput } from '@qurvo/cohort-query';
import type { Expr, QueryNode } from '@qurvo/ch-query';
import {
  add,
  alias,
  arrayCompact,
  arrayElement,
  arrayEnumerate,
  arraySlice,
  col,
  groupArray,
  gte,
  has,
  ifExpr,
  indexOf,
  length,
  literal,
  lt,
  lte,
  match,
  multiIf,
  notInArray,
  param,
  select,
  sub,
  uniqExact,
} from '@qurvo/ch-query';
import {
  projectIs,
  timeRange,
  resolvedPerson,
  cohortFilter,
  cohortBounds,
  propertyFilters,
} from '../query-helpers';
import type { PropertyFilter } from '../query-helpers';
import { MAX_PATH_NODES } from '../../constants';

// ── Public types ──────────────────────────────────────────────────────────────

export interface PathCleaningRule {
  regex: string;
  alias: string;
}

export interface WildcardGroup {
  pattern: string;
  alias: string;
}

export interface PathsQueryParams {
  project_id: string;
  date_from: string;
  date_to: string;
  step_limit: number;
  timezone?: string;
  start_event?: string;
  end_event?: string;
  exclusions?: string[];
  min_persons?: number;
  path_cleaning_rules?: PathCleaningRule[];
  wildcard_groups?: WildcardGroup[];
  filters?: PropertyFilter[];
  cohort_filters?: CohortFilterInput[];
}

export interface PathTransition {
  step: number;
  source: string;
  target: string;
  person_count: number;
}

export interface TopPath {
  path: string[];
  person_count: number;
}

export interface PathsQueryResult {
  transitions: PathTransition[];
  top_paths: TopPath[];
}

// ── Path cleaning expression ──────────────────────────────────────────────────

function buildCleaningExpr(
  rules?: PathCleaningRule[],
  wildcards?: WildcardGroup[],
): Expr {
  const arms: { pattern: string; alias: string }[] = [];

  if (wildcards?.length) {
    for (const wg of wildcards) {
      // Convert glob-style wildcard to regex: /product/* → ^/product/.*
      const regex = wg.pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      arms.push({ pattern: `^${regex}$`, alias: wg.alias });
    }
  }

  if (rules?.length) {
    for (const rule of rules) {
      arms.push({ pattern: rule.regex, alias: rule.alias });
    }
  }

  if (arms.length === 0) { return col('event_name'); }

  const branches = arms.map((a) => ({
    condition: match(col('event_name'), literal(a.pattern)),
    result: literal(a.alias),
  }));
  return multiIf(branches, col('event_name'));
}

// ── Raw row types ─────────────────────────────────────────────────────────────

interface RawTransitionRow {
  step: string;
  source: string;
  target: string;
  person_count: string;
}

interface RawTopPathRow {
  path: string[];
  person_count: string;
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function queryPaths(
  ch: ClickHouseClient,
  params: PathsQueryParams,
): Promise<PathsQueryResult> {
  const cleaningExpr = buildCleaningExpr(params.path_cleaning_rules, params.wildcard_groups);

  const stepLimitParam = param('UInt16', params.step_limit);
  const minPersonsParam = param('UInt32', params.min_persons ?? 1);
  const { dateTo, dateFrom } = cohortBounds(params);

  // CTE 1: ordered_events
  const orderedEvents = select(
    resolvedPerson().as('pid'),
    alias(cleaningExpr, 'cleaned_name'),
    col('timestamp'),
  )
    .from('events')
    .where(
      projectIs(params.project_id),
      timeRange(params.date_from, params.date_to, params.timezone),
      params.exclusions?.length
        ? notInArray(col('event_name'), param('Array(String)', params.exclusions))
        : undefined,
      params.filters?.length ? propertyFilters(params.filters) : undefined,
      cohortFilter(params.cohort_filters, params.project_id, dateTo, dateFrom),
    )
    .orderBy(col('pid'))
    .orderBy(col('timestamp'))
    .build();

  // CTE 2: person_paths
  const personPaths = select(
    col('pid'),
    arraySlice(
      arrayCompact(groupArray(col('cleaned_name'))),
      literal(1), stepLimitParam,
    ).as('raw_path'),
  )
    .from('ordered_events')
    .groupBy(col('pid'))
    .having(gte(length(col('raw_path')), literal(2)))
    .build();

  // CTE 3: trimmed_paths (conditional start_event trim)
  const trimmedPathCol = params.start_event
    ? ifExpr(
        has(col('raw_path'), param('String', params.start_event)),
        arraySlice(col('raw_path'), indexOf(col('raw_path'), param('String', params.start_event))),
        param('Array(String)', []),
      ).as('p1')
    : col('raw_path').as('p1');

  const trimmedPaths = select(col('pid'), trimmedPathCol)
    .from('person_paths')
    .build();

  // CTE 4: final_paths (conditional end_event trim)
  const finalPathCol = params.end_event
    ? ifExpr(
        has(col('p1'), param('String', params.end_event)),
        arraySlice(
          col('p1'),
          literal(1),
          sub(indexOf(col('p1'), param('String', params.end_event)), literal(1)),
        ),
        param('Array(String)', []),
      ).as('path')
    : col('p1').as('path');

  const finalPaths = select(col('pid'), finalPathCol)
    .from('trimmed_paths')
    .where(gte(length(col('p1')), literal(2)))
    .build();

  // Shared CTEs used by both queries
  const sharedCTEs: Array<{ name: string; query: QueryNode }> = [
    { name: 'ordered_events', query: orderedEvents },
    { name: 'person_paths', query: personPaths },
    { name: 'trimmed_paths', query: trimmedPaths },
    { name: 'final_paths', query: finalPaths },
  ];

  // Query 1: Transitions
  const transitionsNode = select(
    col('idx').as('step'),
    arrayElement(col('path'), col('idx')).as('source'),
    arrayElement(col('path'), add(col('idx'), literal(1))).as('target'),
    uniqExact(col('pid')).as('person_count'),
  )
    .withAll(sharedCTEs)
    .from('final_paths')
    .arrayJoin(arrayEnumerate(col('path')), 'idx')
    .where(
      lt(col('idx'), length(col('path'))),
      lte(col('idx'), stepLimitParam),
    )
    .groupBy(col('step'), col('source'), col('target'))
    .having(gte(col('person_count'), minPersonsParam))
    .orderBy(col('step'))
    .orderBy(col('person_count'), 'DESC')
    .build();

  // Query 2: Top paths
  const topPathsNode = select(
    arraySlice(col('path'), literal(1), stepLimitParam).as('path'),
    uniqExact(col('pid')).as('person_count'),
  )
    .withAll(sharedCTEs)
    .from('final_paths')
    .where(gte(length(col('path')), literal(2)))
    .groupBy(col('path'))
    .having(gte(col('person_count'), minPersonsParam))
    .orderBy(col('person_count'), 'DESC')
    .limit(MAX_PATH_NODES)
    .build();

  // Execute both queries in parallel
  const chx = new ChQueryExecutor(ch);
  const [transitionRows, topPathRows] = await Promise.all([
    chx.rows<RawTransitionRow>(transitionsNode),
    chx.rows<RawTopPathRow>(topPathsNode),
  ]);

  const transitions: PathTransition[] = transitionRows.map((r) => ({
    step: Number(r.step),
    source: r.source,
    target: r.target,
    person_count: Number(r.person_count),
  }));

  const top_paths: TopPath[] = topPathRows.map((r) => ({
    path: r.path,
    person_count: Number(r.person_count),
  }));

  return { transitions, top_paths };
}
