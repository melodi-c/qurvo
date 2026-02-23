import type { CohortPropertyCondition } from '@qurvo/db';
import { RESOLVED_PERSON, resolvePropertyExpr } from '../helpers';
import type { BuildContext } from '../types';

export function buildPropertyConditionSubquery(
  cond: CohortPropertyCondition,
  ctx: BuildContext,
): string {
  const condIdx = ctx.counter.value++;
  const pk = `coh_${condIdx}_v`;
  const latestExpr = resolvePropertyExpr(cond.property);

  let havingClause: string;
  switch (cond.operator) {
    case 'eq':
      ctx.queryParams[pk] = cond.value ?? '';
      havingClause = `${latestExpr} = {${pk}:String}`;
      break;
    case 'neq':
      ctx.queryParams[pk] = cond.value ?? '';
      havingClause = `${latestExpr} != {${pk}:String}`;
      break;
    case 'contains':
      ctx.queryParams[pk] = `%${cond.value ?? ''}%`;
      havingClause = `${latestExpr} LIKE {${pk}:String}`;
      break;
    case 'not_contains':
      ctx.queryParams[pk] = `%${cond.value ?? ''}%`;
      havingClause = `${latestExpr} NOT LIKE {${pk}:String}`;
      break;
    case 'is_set':
      havingClause = `${latestExpr} != ''`;
      break;
    case 'is_not_set':
      havingClause = `${latestExpr} = ''`;
      break;
    case 'gt':
      ctx.queryParams[pk] = Number(cond.value ?? 0);
      havingClause = `toFloat64OrZero(${latestExpr}) > {${pk}:Float64}`;
      break;
    case 'lt':
      ctx.queryParams[pk] = Number(cond.value ?? 0);
      havingClause = `toFloat64OrZero(${latestExpr}) < {${pk}:Float64}`;
      break;
    case 'gte':
      ctx.queryParams[pk] = Number(cond.value ?? 0);
      havingClause = `toFloat64OrZero(${latestExpr}) >= {${pk}:Float64}`;
      break;
    case 'lte':
      ctx.queryParams[pk] = Number(cond.value ?? 0);
      havingClause = `toFloat64OrZero(${latestExpr}) <= {${pk}:Float64}`;
      break;
    case 'regex':
      ctx.queryParams[pk] = cond.value ?? '';
      havingClause = `match(${latestExpr}, {${pk}:String})`;
      break;
    case 'not_regex':
      ctx.queryParams[pk] = cond.value ?? '';
      havingClause = `NOT match(${latestExpr}, {${pk}:String})`;
      break;
    case 'in':
      ctx.queryParams[pk] = cond.values ?? [];
      havingClause = `${latestExpr} IN {${pk}:Array(String)}`;
      break;
    case 'not_in':
      ctx.queryParams[pk] = cond.values ?? [];
      havingClause = `${latestExpr} NOT IN {${pk}:Array(String)}`;
      break;
    case 'between': {
      const minPk = `${pk}_min`, maxPk = `${pk}_max`;
      ctx.queryParams[minPk] = Number(cond.values?.[0] ?? 0);
      ctx.queryParams[maxPk] = Number(cond.values?.[1] ?? 0);
      havingClause = `toFloat64OrZero(${latestExpr}) >= {${minPk}:Float64} AND toFloat64OrZero(${latestExpr}) <= {${maxPk}:Float64}`;
      break;
    }
    case 'not_between': {
      const minPk = `${pk}_min`, maxPk = `${pk}_max`;
      ctx.queryParams[minPk] = Number(cond.values?.[0] ?? 0);
      ctx.queryParams[maxPk] = Number(cond.values?.[1] ?? 0);
      havingClause = `(toFloat64OrZero(${latestExpr}) < {${minPk}:Float64} OR toFloat64OrZero(${latestExpr}) > {${maxPk}:Float64})`;
      break;
    }
    default:
      havingClause = '1';
  }

  return `
    SELECT ${RESOLVED_PERSON} AS person_id
    FROM events FINAL
    WHERE project_id = {${ctx.projectIdParam}:UUID}
    GROUP BY person_id
    HAVING ${havingClause}`;
}
