import { describe, expect, test } from 'vitest';
import { compile, compileExprToSql } from '../compiler';
import {
  add,
  and,
  argMax,
  arrayExists,
  arrayMax,
  coalesce,
  col,
  count,
  countIf,
  dictGetOrNull,
  div,
  eq,
  except,
  func,
  funcDistinct,
  groupArray,
  gt,
  gte,
  inArray,
  inSubquery,
  interval,
  jsonExtractRaw,
  jsonExtractString,
  jsonHas,
  lambda,
  like,
  literal,
  lower,
  lt,
  lte,
  match,
  mod,
  mul,
  multiIf,
  multiSearchAny,
  namedParam,
  neq,
  not,
  notInSubquery,
  notLike,
  or,
  param,
  parametricFunc,
  parseDateTimeBestEffortOrZero,
  raw,
  select,
  sub,
  subquery,
  sumIf,
  toDate,
  toFloat64OrZero,
  toString,
  unionAll,
  uniqExact,
} from '../builders';
import type { SelectNode } from '../ast';

describe('compiler', () => {
  describe('expression compilation', () => {
    test('column', () => {
      const q = select(col('name')).from('users').build();
      const { sql } = compile(q);
      expect(sql).toContain('SELECT\n  name');
    });

    test('literal number', () => {
      const q = select(literal(42).as('val')).build();
      const { sql } = compile(q);
      expect(sql).toContain('42 AS val');
    });

    test('literal string', () => {
      const q = select(literal('hello').as('val')).build();
      const { sql } = compile(q);
      expect(sql).toContain("'hello' AS val");
    });

    test('literal boolean', () => {
      const q = select(literal(true).as('t'), literal(false).as('f')).build();
      const { sql } = compile(q);
      expect(sql).toContain('1 AS t');
      expect(sql).toContain('0 AS f');
    });

    test('literal string with single quotes is escaped', () => {
      const q = select(literal("it's").as('val')).build();
      const { sql } = compile(q);
      expect(sql).toContain("'it\\'s' AS val");
    });

    test('param generates placeholder and stores value', () => {
      const q = select(col('*'))
        .from('events')
        .where(eq(col('project_id'), param('UUID', '550e8400-e29b-41d4-a716-446655440000')))
        .build();
      const { sql, params } = compile(q);
      expect(sql).toContain('{p_0:UUID}');
      expect(params).toEqual({ p_0: '550e8400-e29b-41d4-a716-446655440000' });
    });

    test('multiple params get sequential names', () => {
      const q = select(col('*'))
        .from('events')
        .where(
          and(
            eq(col('project_id'), param('UUID', 'pid')),
            gte(col('timestamp'), param('DateTime64(3)', '2024-01-01')),
            lte(col('timestamp'), param('DateTime64(3)', '2024-12-31')),
          ),
        )
        .build();
      const { sql, params } = compile(q);
      expect(sql).toContain('{p_0:UUID}');
      expect(sql).toContain('{p_1:DateTime64(3)}');
      expect(sql).toContain('{p_2:DateTime64(3)}');
      expect(params).toEqual({
        p_0: 'pid',
        p_1: '2024-01-01',
        p_2: '2024-12-31',
      });
    });

    test('raw SQL pass-through', () => {
      const q = select(raw('now()').as('current')).build();
      const { sql } = compile(q);
      expect(sql).toContain('now() AS current');
    });

    test('func call', () => {
      const q = select(func('toStartOfDay', col('timestamp')).as('day')).from('events').build();
      const { sql } = compile(q);
      expect(sql).toContain('toStartOfDay(timestamp) AS day');
    });

    test('func call with DISTINCT', () => {
      const q = select(funcDistinct('count', col('person_id')).as('cnt')).from('events').build();
      const { sql } = compile(q);
      expect(sql).toContain('count(DISTINCT person_id) AS cnt');
    });

    test('alias', () => {
      const q = select(col('name').as('user_name')).from('users').build();
      const { sql } = compile(q);
      expect(sql).toContain('name AS user_name');
    });

    test('NOT expression', () => {
      const q = select(col('*')).from('t').where(not(eq(col('a'), literal(1)))).build();
      const { sql } = compile(q);
      expect(sql).toContain('WHERE NOT a = 1');
    });
  });

  describe('binary operations', () => {
    test('equality', () => {
      const q = select(col('*')).from('t').where(eq(col('a'), literal(1))).build();
      const { sql } = compile(q);
      expect(sql).toContain('WHERE a = 1');
    });

    test('inequality', () => {
      const q = select(col('*')).from('t').where(neq(col('a'), literal(1))).build();
      const { sql } = compile(q);
      expect(sql).toContain('WHERE a != 1');
    });

    test('comparison operators', () => {
      const q = select(col('*'))
        .from('t')
        .where(and(gt(col('a'), literal(1)), lt(col('b'), literal(10))))
        .build();
      const { sql } = compile(q);
      expect(sql).toContain('a > 1 AND b < 10');
    });

    test('LIKE and NOT LIKE', () => {
      const q = select(col('*'))
        .from('t')
        .where(like(col('name'), literal('%test%')))
        .build();
      const { sql } = compile(q);
      expect(sql).toContain("name LIKE '%test%'");

      const q2 = select(col('*'))
        .from('t')
        .where(notLike(col('name'), literal('%test%')))
        .build();
      const { sql: sql2 } = compile(q2);
      expect(sql2).toContain("name NOT LIKE '%test%'");
    });

    test('arithmetic operators', () => {
      const q = select(
        add(col('a'), col('b')).as('sum'),
        sub(col('a'), col('b')).as('diff'),
        mul(col('a'), col('b')).as('prod'),
        div(col('a'), col('b')).as('quot'),
      ).from('t').build();
      const { sql } = compile(q);
      expect(sql).toContain('a + b AS sum');
      expect(sql).toContain('a - b AS diff');
      expect(sql).toContain('a * b AS prod');
      expect(sql).toContain('a / b AS quot');
    });

    test('AND flattens nested chains', () => {
      const condition = and(
        and(eq(col('a'), literal(1)), eq(col('b'), literal(2))),
        eq(col('c'), literal(3)),
      );
      const q = select(col('*')).from('t').where(condition).build();
      const { sql } = compile(q);
      expect(sql).toContain('WHERE a = 1 AND b = 2 AND c = 3');
    });

    test('OR flattens nested chains', () => {
      const condition = or(
        or(eq(col('a'), literal(1)), eq(col('b'), literal(2))),
        eq(col('c'), literal(3)),
      );
      const q = select(col('*')).from('t').where(condition).build();
      const { sql } = compile(q);
      expect(sql).toContain('WHERE a = 1 OR b = 2 OR c = 3');
    });
  });

  describe('and() / or() filtering', () => {
    test('and() filters undefined and false', () => {
      const condition = and(
        eq(col('a'), literal(1)),
        undefined,
        false,
        eq(col('b'), literal(2)),
      );
      const q = select(col('x')).from('t').where(condition).build();
      const { sql } = compile(q);
      expect(sql).toContain('WHERE a = 1 AND b = 2');
      expect(sql).not.toContain('undefined');
    });

    test('and() with single remaining expr returns that expr', () => {
      const condition = and(eq(col('a'), literal(1)), undefined, false);
      const q = select(col('x')).from('t').where(condition).build();
      const { sql } = compile(q);
      expect(sql).toContain('WHERE a = 1');
      expect(sql).not.toContain('AND');
    });

    test('and() with all filtered returns literal 1', () => {
      const condition = and(undefined, false);
      const q = select(col('x')).from('t').where(condition).build();
      const { sql } = compile(q);
      expect(sql).toContain('WHERE 1');
    });

    test('or() filters undefined and false', () => {
      const condition = or(
        eq(col('a'), literal(1)),
        undefined,
        false,
        eq(col('b'), literal(2)),
      );
      const q = select(col('x')).from('t').where(condition).build();
      const { sql } = compile(q);
      expect(sql).toContain('WHERE a = 1 OR b = 2');
    });

    test('or() with all filtered returns literal 0', () => {
      const condition = or(undefined, false);
      const q = select(col('x')).from('t').where(condition).build();
      const { sql } = compile(q);
      expect(sql).toContain('WHERE 0');
    });
  });

  describe('IN expressions', () => {
    test('IN subquery', () => {
      const sub = select(col('person_id'))
        .from('cohort_members')
        .where(eq(col('cohort_id'), param('UUID', 'abc-123')))
        .build();
      const q = select(col('*'))
        .from('events')
        .where(inSubquery(col('person_id'), sub))
        .build();
      const { sql, params } = compile(q);
      expect(sql).toContain('person_id IN (');
      expect(sql).toContain('SELECT\n  person_id');
      expect(sql).toContain('{p_0:UUID}');
      expect(params).toEqual({ p_0: 'abc-123' });
    });

    test('NOT IN subquery', () => {
      const sub = select(col('person_id'))
        .from('blocked_users')
        .build();
      const q = select(col('*'))
        .from('events')
        .where(notInSubquery(col('person_id'), sub))
        .build();
      const { sql } = compile(q);
      expect(sql).toContain('person_id NOT IN (');
    });

    test('IN array param', () => {
      const arr = param('Array(String)', ['a', 'b', 'c']);
      const q = select(col('*'))
        .from('events')
        .where(inArray(col('event'), arr))
        .build();
      const { sql, params } = compile(q);
      expect(sql).toContain('event IN (');
      expect(sql).toContain('{p_0:Array(String)}');
      expect(params).toEqual({ p_0: ['a', 'b', 'c'] });
    });
  });

  describe('multiIf / case', () => {
    test('multiIf compiles correctly', () => {
      const expr = multiIf(
        [
          { condition: eq(col('x'), literal(1)), result: raw("'a'") },
          { condition: eq(col('x'), literal(2)), result: raw("'b'") },
        ],
        raw("'c'"),
      );
      const q = select(expr.as('label')).from('t').build();
      const { sql } = compile(q);
      expect(sql).toContain("multiIf(x = 1, 'a', x = 2, 'b', 'c') AS label");
    });

    test('multiIf with single branch', () => {
      const expr = multiIf(
        [{ condition: eq(col('x'), literal(1)), result: raw("'yes'") }],
        raw("'no'"),
      );
      const q = select(expr.as('flag')).from('t').build();
      const { sql } = compile(q);
      expect(sql).toContain("multiIf(x = 1, 'yes', 'no') AS flag");
    });
  });

  describe('ARRAY JOIN', () => {
    test('basic ARRAY JOIN', () => {
      const q = select(col('person_id'), col('bucket'))
        .from('person_buckets')
        .arrayJoin(col('buckets'), 'bucket')
        .build();
      const { sql } = compile(q);
      expect(sql).toContain('ARRAY JOIN buckets AS bucket');
    });

    test('multiple ARRAY JOINs', () => {
      const q = select(col('person_id'), col('a'), col('b'))
        .from('t')
        .arrayJoin(col('arr_a'), 'a')
        .arrayJoin(col('arr_b'), 'b')
        .build();
      const { sql } = compile(q);
      expect(sql).toContain('ARRAY JOIN arr_a AS a');
      expect(sql).toContain('ARRAY JOIN arr_b AS b');
    });
  });

  describe('subquery expression', () => {
    test('subquery in SELECT', () => {
      const sub = select(count().as('cnt')).from('events').build();
      const q = select(col('name'), subquery(sub).as('total'))
        .from('users')
        .build();
      const { sql } = compile(q);
      expect(sql).toContain('(SELECT\n  count() AS cnt\nFROM events) AS total');
    });
  });

  describe('SELECT clauses', () => {
    test('simple select with param', () => {
      const q = select(count().as('total'))
        .from('events')
        .where(eq(col('project_id'), param('UUID', '550e8400')))
        .build();
      const { sql, params } = compile(q);
      expect(sql).toContain('SELECT\n  count() AS total');
      expect(sql).toContain('FROM events');
      expect(sql).toContain('WHERE project_id = {p_0:UUID}');
      expect(params).toEqual({ p_0: '550e8400' });
    });

    test('FROM with alias', () => {
      const q = select(col('e.name'))
        .from('events', 'e')
        .build();
      const { sql } = compile(q);
      expect(sql).toContain('FROM events AS e');
    });

    test('FROM subquery', () => {
      const inner = select(col('person_id'), count().as('cnt'))
        .from('events')
        .groupBy(col('person_id'))
        .build();
      const q = select(col('cnt'), count().as('user_count'))
        .from(inner, 'per_person')
        .groupBy(col('cnt'))
        .build();
      const { sql } = compile(q);
      expect(sql).toContain('FROM (SELECT');
      expect(sql).toContain(') AS per_person');
    });

    test('GROUP BY', () => {
      const q = select(col('event'), count().as('cnt'))
        .from('events')
        .groupBy(col('event'))
        .build();
      const { sql } = compile(q);
      expect(sql).toContain('GROUP BY event');
    });

    test('GROUP BY multiple columns', () => {
      const q = select(col('event'), col('day'), count().as('cnt'))
        .from('events')
        .groupBy(col('event'), col('day'))
        .build();
      const { sql } = compile(q);
      expect(sql).toContain('GROUP BY event, day');
    });

    test('HAVING', () => {
      const q = select(col('event'), count().as('cnt'))
        .from('events')
        .groupBy(col('event'))
        .having(gt(count(), literal(10)))
        .build();
      const { sql } = compile(q);
      expect(sql).toContain('HAVING count() > 10');
    });

    test('ORDER BY', () => {
      const q = select(col('event'), count().as('cnt'))
        .from('events')
        .groupBy(col('event'))
        .orderBy(count(), 'DESC')
        .build();
      const { sql } = compile(q);
      expect(sql).toContain('ORDER BY count() DESC');
    });

    test('ORDER BY multiple', () => {
      const q = select(col('a'), col('b'))
        .from('t')
        .orderBy(col('a'), 'ASC')
        .orderBy(col('b'), 'DESC')
        .build();
      const { sql } = compile(q);
      expect(sql).toContain('ORDER BY a ASC, b DESC');
    });

    test('LIMIT', () => {
      const q = select(col('*')).from('events').limit(100).build();
      const { sql } = compile(q);
      expect(sql).toContain('LIMIT 100');
    });

    test('LIMIT with OFFSET', () => {
      const q = select(col('*')).from('events').limit(100).offset(50).build();
      const { sql } = compile(q);
      expect(sql).toContain('LIMIT 100 OFFSET 50');
    });

    test('PREWHERE', () => {
      const q = select(col('*'))
        .from('events')
        .prewhere(eq(col('project_id'), param('UUID', 'pid')))
        .where(eq(col('event'), param('String', 'click')))
        .build();
      const { sql, params } = compile(q);
      expect(sql).toContain('PREWHERE project_id = {p_0:UUID}');
      expect(sql).toContain('WHERE event = {p_1:String}');
      expect(params).toEqual({ p_0: 'pid', p_1: 'click' });
      // PREWHERE should come before WHERE
      const prewhereIdx = sql.indexOf('PREWHERE');
      const whereIdx = sql.indexOf('WHERE');
      expect(prewhereIdx).toBeLessThan(whereIdx);
    });
  });

  describe('JOINs', () => {
    test('INNER JOIN', () => {
      const q = select(col('e.name'), col('u.email'))
        .from('events', 'e')
        .innerJoin('users', 'u', eq(col('e.user_id'), col('u.id')))
        .build();
      const { sql } = compile(q);
      expect(sql).toContain('INNER JOIN users AS u ON e.user_id = u.id');
    });

    test('LEFT JOIN', () => {
      const q = select(col('*'))
        .from('events', 'e')
        .leftJoin('properties', 'p', eq(col('e.id'), col('p.event_id')))
        .build();
      const { sql } = compile(q);
      expect(sql).toContain('LEFT JOIN properties AS p ON e.id = p.event_id');
    });

    test('CROSS JOIN with subquery', () => {
      const timeSeries = select(col('day'))
        .from('numbers(7)')
        .build();
      const q = select(col('*'))
        .from('events', 'e')
        .crossJoin(timeSeries, 'ts')
        .build();
      const { sql } = compile(q);
      expect(sql).toContain('CROSS JOIN (SELECT');
      expect(sql).toContain(') AS ts');
    });

    test('multiple JOINs', () => {
      const q = select(col('*'))
        .from('events', 'e')
        .innerJoin('users', 'u', eq(col('e.user_id'), col('u.id')))
        .leftJoin('properties', 'p', eq(col('e.id'), col('p.event_id')))
        .build();
      const { sql } = compile(q);
      expect(sql).toContain('INNER JOIN users');
      expect(sql).toContain('LEFT JOIN properties');
    });
  });

  describe('CTE (WITH)', () => {
    test('single CTE', () => {
      const cte = select(col('person_id'), count().as('cnt'))
        .from('events')
        .groupBy(col('person_id'))
        .build();
      const q = select(col('cnt'), count().as('user_count'))
        .with('per_person', cte)
        .from('per_person')
        .groupBy(col('cnt'))
        .build();
      const { sql } = compile(q);
      expect(sql).toContain('WITH');
      expect(sql).toContain('per_person AS (');
      expect(sql).toContain('SELECT\n  cnt');
    });

    test('multiple CTEs', () => {
      const cte1 = select(col('person_id'), count().as('cnt'))
        .from('events')
        .groupBy(col('person_id'))
        .build();
      const cte2 = select(col('person_id'))
        .from('cohort_members')
        .build();
      const q = select(col('*'))
        .with('event_counts', cte1)
        .with('members', cte2)
        .from('event_counts')
        .where(inSubquery(col('person_id'), select(col('person_id')).from('members').build()))
        .build();
      const { sql } = compile(q);
      expect(sql).toContain('event_counts AS (');
      expect(sql).toContain('members AS (');
    });
  });

  describe('UNION ALL', () => {
    test('basic union all', () => {
      const q1 = select(literal(0).as('idx')).from('events').build();
      const q2 = select(literal(1).as('idx')).from('events').build();
      const u = unionAll(q1, q2);
      const { sql } = compile(u);
      expect(sql).toContain('UNION ALL');
      expect(sql).toContain('0 AS idx');
      expect(sql).toContain('1 AS idx');
    });

    test('union all with three queries', () => {
      const q1 = select(literal(1).as('n')).build();
      const q2 = select(literal(2).as('n')).build();
      const q3 = select(literal(3).as('n')).build();
      const u = unionAll(q1, q2, q3);
      const { sql } = compile(u);
      const parts = sql.split('UNION ALL');
      expect(parts).toHaveLength(3);
    });

    test('union all shares param context', () => {
      const q1 = select(col('*'))
        .from('events')
        .where(eq(col('project_id'), param('UUID', 'pid1')))
        .build();
      const q2 = select(col('*'))
        .from('events')
        .where(eq(col('project_id'), param('UUID', 'pid2')))
        .build();
      const u = unionAll(q1, q2);
      const { params } = compile(u);
      expect(params).toEqual({ p_0: 'pid1', p_1: 'pid2' });
    });
  });

  describe('shortcut functions', () => {
    test('count()', () => {
      const q = select(count().as('total')).from('events').build();
      const { sql } = compile(q);
      expect(sql).toContain('count() AS total');
    });

    test('countIf()', () => {
      const q = select(countIf(eq(col('event'), param('String', 'click'))).as('clicks'))
        .from('events')
        .build();
      const { sql } = compile(q);
      expect(sql).toContain('countIf(event = {p_0:String}) AS clicks');
    });

    test('uniqExact()', () => {
      const q = select(uniqExact(col('person_id')).as('unique_users'))
        .from('events')
        .build();
      const { sql } = compile(q);
      expect(sql).toContain('uniqExact(person_id) AS unique_users');
    });

    test('sumIf()', () => {
      const q = select(
        sumIf(col('amount'), gt(col('amount'), literal(0))).as('positive_sum'),
      ).from('events').build();
      const { sql } = compile(q);
      expect(sql).toContain('sumIf(amount, amount > 0) AS positive_sum');
    });

    test('groupArray()', () => {
      const q = select(groupArray(col('event')).as('events_list'))
        .from('events')
        .groupBy(col('person_id'))
        .build();
      const { sql } = compile(q);
      expect(sql).toContain('groupArray(event) AS events_list');
    });

    test('toString()', () => {
      const q = select(toString(col('id')).as('id_str')).from('t').build();
      const { sql } = compile(q);
      expect(sql).toContain('toString(id) AS id_str');
    });
  });

  describe('complex real-world-like queries', () => {
    test('analytics query with CTE + filters + group by + order', () => {
      const projectId = '550e8400-e29b-41d4-a716-446655440000';
      const from = '2024-01-01';
      const to = '2024-01-31';

      const q = select(
        func('toStartOfDay', col('timestamp')).as('day'),
        uniqExact(col('person_id')).as('unique_users'),
        count().as('total_events'),
      )
        .from('events')
        .prewhere(eq(col('project_id'), param('UUID', projectId)))
        .where(
          and(
            gte(col('timestamp'), param('DateTime64(3)', from)),
            lte(col('timestamp'), param('DateTime64(3)', to)),
          ),
        )
        .groupBy(func('toStartOfDay', col('timestamp')))
        .orderBy(func('toStartOfDay', col('timestamp')), 'ASC')
        .build();

      const { sql, params } = compile(q);
      expect(sql).toContain('SELECT');
      expect(sql).toContain('toStartOfDay(timestamp) AS day');
      expect(sql).toContain('uniqExact(person_id) AS unique_users');
      expect(sql).toContain('count() AS total_events');
      expect(sql).toContain('FROM events');
      expect(sql).toContain('PREWHERE project_id = {p_0:UUID}');
      expect(sql).toContain('WHERE timestamp >= {p_1:DateTime64(3)} AND timestamp <= {p_2:DateTime64(3)}');
      expect(sql).toContain('GROUP BY toStartOfDay(timestamp)');
      expect(sql).toContain('ORDER BY toStartOfDay(timestamp) ASC');
      expect(params).toEqual({
        p_0: projectId,
        p_1: from,
        p_2: to,
      });
    });

    test('funnel-like query with CTE + IN subquery', () => {
      const cohortSub = select(col('person_id'))
        .from('cohort_members')
        .where(eq(col('cohort_id'), param('UUID', 'cohort-1')))
        .build();

      const funnelCte = select(
        col('person_id'),
        func('windowFunnel', literal(86400), col('timestamp'),
          eq(col('event'), param('String', 'pageview')),
          eq(col('event'), param('String', 'signup')),
        ).as('level'),
      )
        .from('events')
        .where(
          and(
            eq(col('project_id'), param('UUID', 'pid')),
            inSubquery(col('person_id'), cohortSub),
          ),
        )
        .groupBy(col('person_id'))
        .build();

      const q = select(col('level'), count().as('users'))
        .with('funnel', funnelCte)
        .from('funnel')
        .groupBy(col('level'))
        .orderBy(col('level'), 'ASC')
        .build();

      const { sql, params } = compile(q);
      expect(sql).toContain('WITH');
      expect(sql).toContain('funnel AS (');
      expect(sql).toContain('windowFunnel(');
      expect(sql).toContain('person_id IN (');
      expect(sql).toContain('FROM funnel');
      expect(Object.keys(params)).toHaveLength(4);
    });

    test('conditional where filters', () => {
      const hasBreakdown = false;
      const hasCohort = true;

      const cohortSub = select(col('person_id'))
        .from('cohort_members')
        .where(eq(col('cohort_id'), param('UUID', 'c-1')))
        .build();

      const q = select(count().as('total'))
        .from('events')
        .where(
          eq(col('project_id'), param('UUID', 'p-1')),
          hasBreakdown ? eq(col('breakdown'), param('String', 'value')) : undefined,
          hasCohort ? inSubquery(col('person_id'), cohortSub) : undefined,
        )
        .build();

      const { sql, params } = compile(q);
      expect(sql).toContain('project_id = {p_0:UUID}');
      expect(sql).toContain('person_id IN (');
      expect(sql).not.toContain('breakdown');
      // p_0 = project_id, p_1 = cohort_id (breakdown skipped)
      expect(Object.keys(params)).toHaveLength(2);
    });
  });

  describe('parametric functions', () => {
    test('windowFunnel(N)(cond1, cond2)', () => {
      const q = select(
        parametricFunc(
          'windowFunnel',
          [literal(86400)],
          [
            eq(col('event'), param('String', 'pageview')),
            eq(col('event'), param('String', 'signup')),
          ],
        ).as('level'),
      ).from('events').groupBy(col('person_id')).build();
      const { sql } = compile(q);
      expect(sql).toContain('windowFunnel(86400)(event = {p_0:String}, event = {p_1:String}) AS level');
    });

    test('quantile(0.5)(expr)', () => {
      const q = select(
        parametricFunc('quantile', [literal(0.5)], [col('duration')]).as('median'),
      ).from('t').build();
      const { sql } = compile(q);
      expect(sql).toContain('quantile(0.5)(duration) AS median');
    });

    test('groupArray(100)(expr)', () => {
      const q = select(
        parametricFunc('groupArray', [literal(100)], [col('event')]).as('recent_events'),
      ).from('events').groupBy(col('person_id')).build();
      const { sql } = compile(q);
      expect(sql).toContain('groupArray(100)(event) AS recent_events');
    });

    test('windowFunnel with strict_order param', () => {
      const q = select(
        parametricFunc(
          'windowFunnel',
          [literal(86400), literal('strict_order')],
          [col('step1'), col('step2'), col('step3')],
        ).as('level'),
      ).from('events').build();
      const { sql } = compile(q);
      expect(sql).toContain("windowFunnel(86400, 'strict_order')(step1, step2, step3) AS level");
    });
  });

  describe('lambda expressions', () => {
    test('single param lambda', () => {
      const q = select(
        func('arrayExists', lambda(['x'], gt(col('x'), literal(0))), col('arr')).as('has_positive'),
      ).from('t').build();
      const { sql } = compile(q);
      expect(sql).toContain('arrayExists(x -> x > 0, arr) AS has_positive');
    });

    test('multi-param lambda', () => {
      const q = select(
        func('arrayMap', lambda(['x', 'y'], add(col('x'), col('y'))), col('a'), col('b')).as('sums'),
      ).from('t').build();
      const { sql } = compile(q);
      expect(sql).toContain('arrayMap((x, y) -> x + y, a, b) AS sums');
    });

    test('lambda with complex body', () => {
      const q = select(
        func('arrayFilter', lambda(['x'], and(gt(col('x'), literal(0)), lt(col('x'), literal(100)))), col('arr')).as('filtered'),
      ).from('t').build();
      const { sql } = compile(q);
      expect(sql).toContain('arrayFilter(x -> x > 0 AND x < 100, arr) AS filtered');
    });

    test('arrayExists shortcut with lambda', () => {
      const q = select(
        arrayExists(lambda(['x'], gt(col('x'), literal(0))), col('arr')).as('result'),
      ).from('t').build();
      const { sql } = compile(q);
      expect(sql).toContain('arrayExists(x -> x > 0, arr) AS result');
    });

    test('arrayMax shortcut with lambda', () => {
      const q = select(
        arrayMax(lambda(['x'], col('x')), col('timestamps')).as('latest'),
      ).from('t').build();
      const { sql } = compile(q);
      expect(sql).toContain('arrayMax(x -> x, timestamps) AS latest');
    });
  });

  describe('interval expressions', () => {
    test('INTERVAL N DAY', () => {
      const q = select(col('*'))
        .from('events')
        .where(gte(col('timestamp'), sub(raw('now()'), interval(7, 'DAY'))))
        .build();
      const { sql } = compile(q);
      expect(sql).toContain('timestamp >= now() - INTERVAL 7 DAY');
    });

    test('INTERVAL with different units', () => {
      const { sql: sql1 } = compileExprToSql(interval(30, 'MINUTE'));
      expect(sql1).toBe('INTERVAL 30 MINUTE');

      const { sql: sql2 } = compileExprToSql(interval(1, 'HOUR'));
      expect(sql2).toBe('INTERVAL 1 HOUR');

      const { sql: sql3 } = compileExprToSql(interval(3, 'MONTH'));
      expect(sql3).toBe('INTERVAL 3 MONTH');
    });

    test('INTERVAL in date arithmetic', () => {
      const q = select(
        add(col('created_at'), interval(30, 'DAY')).as('expiry'),
      ).from('users').build();
      const { sql } = compile(q);
      expect(sql).toContain('created_at + INTERVAL 30 DAY AS expiry');
    });
  });

  describe('named parameters', () => {
    test('namedParam generates {key:Type} placeholder', () => {
      const q = select(col('*'))
        .from('events')
        .where(eq(col('cohort_id'), namedParam('cohort_bd_0_id', 'String', 'abc-123')))
        .build();
      const { sql, params } = compile(q);
      expect(sql).toContain('{cohort_bd_0_id:String}');
      expect(params).toEqual({ cohort_bd_0_id: 'abc-123' });
    });

    test('namedParam coexists with auto-incrementing params', () => {
      const q = select(col('*'))
        .from('events')
        .where(
          and(
            eq(col('project_id'), param('UUID', 'pid')),
            eq(col('cohort_id'), namedParam('my_cohort', 'String', 'c-1')),
          ),
        )
        .build();
      const { sql, params } = compile(q);
      expect(sql).toContain('{p_0:UUID}');
      expect(sql).toContain('{my_cohort:String}');
      expect(params).toEqual({ p_0: 'pid', my_cohort: 'c-1' });
    });
  });

  describe('SELECT DISTINCT', () => {
    test('basic SELECT DISTINCT', () => {
      const q = select(col('person_id')).distinct().from('events').build();
      const { sql } = compile(q);
      expect(sql).toContain('SELECT DISTINCT\n  person_id');
    });

    test('SELECT DISTINCT with multiple columns', () => {
      const q = select(col('person_id'), col('event'))
        .distinct()
        .from('events')
        .where(eq(col('project_id'), param('UUID', 'pid')))
        .build();
      const { sql } = compile(q);
      expect(sql).toContain('SELECT DISTINCT\n  person_id');
      expect(sql).toContain('event');
    });

    test('non-distinct SELECT still works', () => {
      const q = select(col('person_id')).from('events').build();
      const { sql } = compile(q);
      expect(sql).toContain('SELECT\n  person_id');
      expect(sql).not.toContain('DISTINCT');
    });
  });

  describe('modulo operator', () => {
    test('mod() compiles to %', () => {
      const q = select(col('*'))
        .from('events')
        .where(lt(mod(func('sipHash64', col('person_id')), literal(100)), literal(10)))
        .build();
      const { sql } = compile(q);
      expect(sql).toContain('sipHash64(person_id) % 100 < 10');
    });
  });

  describe('except()', () => {
    test('EXCEPT set operation', () => {
      const q1 = select(col('person_id')).from('all_users').build();
      const q2 = select(col('person_id')).from('blocked_users').build();
      const e = except(q1, q2);
      const { sql } = compile(e);
      expect(sql).toContain('SELECT\n  person_id\nFROM all_users\nEXCEPT\nSELECT\n  person_id\nFROM blocked_users');
    });
  });

  describe('new ClickHouse function shortcuts', () => {
    test('jsonExtractString compiles correctly', () => {
      const q = select(
        jsonExtractString(col('properties'), 'name').as('prop_name'),
      ).from('events').build();
      const { sql } = compile(q);
      expect(sql).toContain("JSONExtractString(properties, 'name') AS prop_name");
    });

    test('jsonExtractString with nested keys', () => {
      const q = select(
        jsonExtractString(col('data'), 'user', 'address', 'city').as('city'),
      ).from('events').build();
      const { sql } = compile(q);
      expect(sql).toContain("JSONExtractString(data, 'user', 'address', 'city') AS city");
    });

    test('jsonExtractRaw', () => {
      const q = select(jsonExtractRaw(col('data'), 'payload').as('raw_payload')).from('t').build();
      const { sql } = compile(q);
      expect(sql).toContain("JSONExtractRaw(data, 'payload') AS raw_payload");
    });

    test('jsonHas', () => {
      const q = select(col('*')).from('t').where(eq(jsonHas(col('props'), 'key'), literal(1))).build();
      const { sql } = compile(q);
      expect(sql).toContain("JSONHas(props, 'key') = 1");
    });

    test('toFloat64OrZero', () => {
      const q = select(toFloat64OrZero(col('str_val')).as('num_val')).from('t').build();
      const { sql } = compile(q);
      expect(sql).toContain('toFloat64OrZero(str_val) AS num_val');
    });

    test('toDate', () => {
      const q = select(toDate(col('timestamp')).as('day')).from('events').build();
      const { sql } = compile(q);
      expect(sql).toContain('toDate(timestamp) AS day');
    });

    test('parseDateTimeBestEffortOrZero', () => {
      const q = select(parseDateTimeBestEffortOrZero(col('date_str')).as('dt')).from('t').build();
      const { sql } = compile(q);
      expect(sql).toContain('parseDateTimeBestEffortOrZero(date_str) AS dt');
    });

    test('argMax', () => {
      const q = select(argMax(col('user_properties'), col('timestamp')).as('latest_props'))
        .from('events')
        .groupBy(col('person_id'))
        .build();
      const { sql } = compile(q);
      expect(sql).toContain('argMax(user_properties, timestamp) AS latest_props');
    });

    test('dictGetOrNull', () => {
      const q = select(
        dictGetOrNull('person_overrides_dict', 'override_id', col('person_id')).as('canonical_id'),
      ).from('events').build();
      const { sql } = compile(q);
      expect(sql).toContain("dictGetOrNull('person_overrides_dict', 'override_id', person_id) AS canonical_id");
    });

    test('lower', () => {
      const q = select(lower(col('email')).as('email_lower')).from('users').build();
      const { sql } = compile(q);
      expect(sql).toContain('lower(email) AS email_lower');
    });

    test('match (REGEXP)', () => {
      const q = select(col('*')).from('events').where(match(col('url'), literal('^https://.*'))).build();
      const { sql } = compile(q);
      expect(sql).toContain("match(url, '^https://.*')");
    });

    test('multiSearchAny', () => {
      const q = select(col('*'))
        .from('events')
        .where(multiSearchAny(col('text'), param('Array(String)', ['foo', 'bar'])))
        .build();
      const { sql, params } = compile(q);
      expect(sql).toContain('multiSearchAny(text, {p_0:Array(String)})');
      expect(params).toEqual({ p_0: ['foo', 'bar'] });
    });

    test('coalesce', () => {
      const q = select(
        coalesce(
          dictGetOrNull('person_overrides_dict', 'override_id', col('person_id')),
          col('person_id'),
        ).as('resolved_person'),
      ).from('events').build();
      const { sql } = compile(q);
      expect(sql).toContain("coalesce(dictGetOrNull('person_overrides_dict', 'override_id', person_id), person_id) AS resolved_person");
    });
  });

  describe('real-world patterns with new features', () => {
    test('sampling with mod: sipHash64(person_id) % 100 < N', () => {
      const sampleRate = 10;
      const q = select(count().as('sampled_count'))
        .from('events')
        .where(lt(mod(func('sipHash64', col('person_id')), literal(100)), literal(sampleRate)))
        .build();
      const { sql } = compile(q);
      expect(sql).toContain('sipHash64(person_id) % 100 < 10');
    });

    test('RESOLVED_PERSON pattern with coalesce + dictGetOrNull', () => {
      const q = select(
        coalesce(
          dictGetOrNull('person_overrides_dict', 'override_person_id', col('person_id')),
          col('person_id'),
        ).as('resolved_person'),
        count().as('cnt'),
      )
        .from('events')
        .groupBy(col('resolved_person'))
        .build();
      const { sql } = compile(q);
      expect(sql).toContain("coalesce(dictGetOrNull('person_overrides_dict', 'override_person_id', person_id), person_id) AS resolved_person");
    });

    test('funnel with parametricFunc + interval', () => {
      const q = select(
        parametricFunc(
          'windowFunnel',
          [literal(86400), literal('strict_order')],
          [
            eq(col('event'), param('String', 'step1')),
            eq(col('event'), param('String', 'step2')),
          ],
        ).as('level'),
      )
        .from('events')
        .where(gte(col('timestamp'), sub(raw('now()'), interval(30, 'DAY'))))
        .groupBy(col('person_id'))
        .build();
      const { sql } = compile(q);
      expect(sql).toContain("windowFunnel(86400, 'strict_order')");
      expect(sql).toContain('INTERVAL 30 DAY');
    });

    test('SELECT DISTINCT + except for cohort exclusion', () => {
      const allUsers = select(col('person_id')).distinct().from('events').build();
      const excluded = select(col('person_id')).distinct().from('blocked').build();
      const e = except(allUsers, excluded);
      const { sql } = compile(e);
      expect(sql).toContain('SELECT DISTINCT');
      expect(sql).toContain('EXCEPT');
    });
  });
});
