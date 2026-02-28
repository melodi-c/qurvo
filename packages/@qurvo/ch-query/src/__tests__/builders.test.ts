import { describe, expect, test } from 'vitest';
import {
  add,
  and,
  argMax,
  arrayExists,
  arrayFilter,
  arrayMax,
  arraySort,
  avg,
  avgIf,
  coalesce,
  col,
  count,
  countDistinct,
  countIf,
  dictGetOrNull,
  div,
  eq,
  except,
  func,
  funcDistinct,
  groupArray,
  groupArrayIf,
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
  max,
  maxIf,
  min,
  minIf,
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
  sum,
  sumIf,
  toDate,
  toFloat64OrZero,
  toString,
  unionAll,
  uniqExact,
} from '../builders';

describe('builders', () => {
  describe('expression factories', () => {
    test('col() returns ColumnExpr', () => {
      const c = col('person_id');
      expect(c).toEqual(expect.objectContaining({ type: 'column', name: 'person_id' }));
    });

    test('literal() returns LiteralExpr', () => {
      expect(literal(42)).toEqual(expect.objectContaining({ type: 'literal', value: 42 }));
      expect(literal('hello')).toEqual(expect.objectContaining({ type: 'literal', value: 'hello' }));
      expect(literal(true)).toEqual(expect.objectContaining({ type: 'literal', value: true }));
    });

    test('param() returns ParamExpr', () => {
      const p = param('UUID', '123');
      expect(p).toEqual(expect.objectContaining({ type: 'param', chType: 'UUID', value: '123' }));
    });

    test('raw() returns RawExpr', () => {
      const r = raw('now()');
      expect(r).toEqual(expect.objectContaining({ type: 'raw', sql: 'now()' }));
    });

    test('func() returns FuncCallExpr', () => {
      const f = func('toStartOfDay', col('timestamp'));
      expect(f.type).toBe('func');
      expect(f.name).toBe('toStartOfDay');
      expect(f.args).toHaveLength(1);
    });

    test('funcDistinct() returns FuncCallExpr with distinct=true', () => {
      const f = funcDistinct('count', col('person_id'));
      expect(f.type).toBe('func');
      expect(f.distinct).toBe(true);
    });
  });

  describe('.as() alias method', () => {
    test('col().as() creates AliasExpr', () => {
      const a = col('name').as('user_name');
      expect(a.type).toBe('alias');
      expect(a.alias).toBe('user_name');
      expect(a.expr).toEqual(expect.objectContaining({ type: 'column', name: 'name' }));
    });

    test('literal().as() creates AliasExpr', () => {
      const a = literal(42).as('answer');
      expect(a.type).toBe('alias');
      expect(a.alias).toBe('answer');
    });

    test('param().as() creates AliasExpr', () => {
      const a = param('UUID', '123').as('id');
      expect(a.type).toBe('alias');
      expect(a.alias).toBe('id');
    });

    test('raw().as() creates AliasExpr', () => {
      const a = raw('now()').as('current');
      expect(a.type).toBe('alias');
      expect(a.alias).toBe('current');
    });

    test('func().as() creates AliasExpr', () => {
      const a = func('count').as('total');
      expect(a.type).toBe('alias');
      expect(a.alias).toBe('total');
    });

    test('subquery().as() creates AliasExpr', () => {
      const q = select(count()).from('events').build();
      const a = subquery(q).as('cnt');
      expect(a.type).toBe('alias');
      expect(a.alias).toBe('cnt');
    });
  });

  describe('shortcut functions', () => {
    test('count()', () => {
      const c = count();
      expect(c).toEqual(expect.objectContaining({ type: 'func', name: 'count', args: [] }));
    });

    test('countDistinct()', () => {
      const c = countDistinct(col('person_id'));
      expect(c.distinct).toBe(true);
      expect(c.name).toBe('count');
    });

    test('countIf()', () => {
      const c = countIf(eq(col('a'), literal(1)));
      expect(c.name).toBe('countIf');
      expect(c.args).toHaveLength(1);
    });

    test('uniqExact()', () => {
      const u = uniqExact(col('person_id'));
      expect(u.name).toBe('uniqExact');
    });

    test('aggregate functions: avg, sum, min, max', () => {
      expect(avg(col('x')).name).toBe('avg');
      expect(sum(col('x')).name).toBe('sum');
      expect(min(col('x')).name).toBe('min');
      expect(max(col('x')).name).toBe('max');
    });

    test('conditional aggregate functions', () => {
      const cond = eq(col('a'), literal(1));
      expect(avgIf(col('x'), cond).name).toBe('avgIf');
      expect(sumIf(col('x'), cond).name).toBe('sumIf');
      expect(minIf(col('x'), cond).name).toBe('minIf');
      expect(maxIf(col('x'), cond).name).toBe('maxIf');
      // All should have 2 args
      expect(avgIf(col('x'), cond).args).toHaveLength(2);
    });

    test('groupArray and groupArrayIf', () => {
      expect(groupArray(col('x')).name).toBe('groupArray');
      expect(groupArrayIf(col('x'), eq(col('a'), literal(1))).name).toBe('groupArrayIf');
    });

    test('arraySort()', () => {
      expect(arraySort(col('arr')).name).toBe('arraySort');
    });

    test('arrayFilter()', () => {
      const af = arrayFilter('x -> x > 0', col('arr'));
      expect(af.name).toBe('arrayFilter');
      expect(af.args).toHaveLength(2);
      // first arg should be raw
      expect(af.args[0]).toEqual(expect.objectContaining({ type: 'raw', sql: 'x -> x > 0' }));
    });

    test('toString()', () => {
      expect(toString(col('id')).name).toBe('toString');
    });
  });

  describe('condition builders', () => {
    test('eq()', () => {
      const e = eq(col('a'), literal(1));
      expect(e.type).toBe('binary');
      expect(e.op).toBe('=');
    });

    test('neq()', () => {
      expect(neq(col('a'), literal(1)).op).toBe('!=');
    });

    test('gt(), gte(), lt(), lte()', () => {
      expect(gt(col('a'), literal(1)).op).toBe('>');
      expect(gte(col('a'), literal(1)).op).toBe('>=');
      expect(lt(col('a'), literal(1)).op).toBe('<');
      expect(lte(col('a'), literal(1)).op).toBe('<=');
    });

    test('like(), notLike()', () => {
      expect(like(col('a'), literal('%test%')).op).toBe('LIKE');
      expect(notLike(col('a'), literal('%test%')).op).toBe('NOT LIKE');
    });

    test('not()', () => {
      const n = not(eq(col('a'), literal(1)));
      expect(n.type).toBe('not');
    });

    test('arithmetic: add, sub, mul, div, mod', () => {
      expect(add(col('a'), col('b')).op).toBe('+');
      expect(sub(col('a'), col('b')).op).toBe('-');
      expect(mul(col('a'), col('b')).op).toBe('*');
      expect(div(col('a'), col('b')).op).toBe('/');
      expect(mod(col('a'), col('b')).op).toBe('%');
    });

    test('inSubquery()', () => {
      const q = select(col('id')).from('t').build();
      const expr = inSubquery(col('a'), q);
      expect(expr.type).toBe('in');
      expect(expr.negated).toBeUndefined();
    });

    test('notInSubquery()', () => {
      const q = select(col('id')).from('t').build();
      const expr = notInSubquery(col('a'), q);
      expect(expr.type).toBe('in');
      expect(expr.negated).toBe(true);
    });

    test('inArray()', () => {
      const arr = param('Array(String)', ['a', 'b']);
      const expr = inArray(col('event'), arr);
      expect(expr.type).toBe('in');
      expect(expr.target).toEqual(expect.objectContaining({ type: 'param' }));
    });

    test('multiIf()', () => {
      const expr = multiIf(
        [{ condition: eq(col('x'), literal(1)), result: literal('a') }],
        literal('b'),
      );
      expect(expr.type).toBe('case');
      expect(expr.branches).toHaveLength(1);
      expect(expr.else_result).toEqual(expect.objectContaining({ type: 'literal', value: 'b' }));
    });
  });

  describe('and() / or()', () => {
    test('and() with multiple exprs', () => {
      const result = and(eq(col('a'), literal(1)), eq(col('b'), literal(2)));
      expect(result.type).toBe('binary');
      if (result.type === 'binary') {
        expect(result.op).toBe('AND');
      }
    });

    test('and() filters undefined and false', () => {
      const result = and(
        eq(col('a'), literal(1)),
        undefined,
        false,
        eq(col('b'), literal(2)),
      );
      expect(result.type).toBe('binary');
    });

    test('and() with single remaining returns that expr', () => {
      const e = eq(col('a'), literal(1));
      const result = and(e, undefined, false);
      expect(result).toBe(e);
    });

    test('and() with all filtered returns literal 1', () => {
      const result = and(undefined, false);
      expect(result).toEqual(expect.objectContaining({ type: 'literal', value: 1 }));
    });

    test('or() with multiple exprs', () => {
      const result = or(eq(col('a'), literal(1)), eq(col('b'), literal(2)));
      expect(result.type).toBe('binary');
      if (result.type === 'binary') {
        expect(result.op).toBe('OR');
      }
    });

    test('or() filters undefined and false', () => {
      const result = or(eq(col('a'), literal(1)), undefined, false);
      expect(result).toEqual(expect.objectContaining({ type: 'binary', op: '=' }));
    });

    test('or() with all filtered returns literal 0', () => {
      const result = or(undefined, false);
      expect(result).toEqual(expect.objectContaining({ type: 'literal', value: 0 }));
    });
  });

  describe('SelectBuilder', () => {
    test('basic select', () => {
      const node = select(col('a'), col('b')).from('t').build();
      expect(node.type).toBe('select');
      expect(node.columns).toHaveLength(2);
      expect(node.from).toBe('t');
    });

    test('from with alias', () => {
      const node = select(col('*')).from('events', 'e').build();
      expect(node.from).toBe('events');
      expect(node.fromAlias).toBe('e');
    });

    test('from subquery', () => {
      const inner = select(col('*')).from('events').build();
      const node = select(col('*')).from(inner, 'sub').build();
      expect(node.from).toEqual(expect.objectContaining({ type: 'select' }));
      expect(node.fromAlias).toBe('sub');
    });

    test('where() auto-ands conditions', () => {
      const node = select(col('*'))
        .from('t')
        .where(eq(col('a'), literal(1)), eq(col('b'), literal(2)))
        .build();
      expect(node.where).toEqual(expect.objectContaining({ type: 'binary', op: 'AND' }));
    });

    test('prewhere()', () => {
      const node = select(col('*'))
        .from('t')
        .prewhere(eq(col('a'), literal(1)))
        .build();
      expect(node.prewhere).toBeDefined();
    });

    test('groupBy()', () => {
      const node = select(col('a'), count())
        .from('t')
        .groupBy(col('a'))
        .build();
      expect(node.groupBy).toHaveLength(1);
    });

    test('having()', () => {
      const node = select(col('a'), count().as('cnt'))
        .from('t')
        .groupBy(col('a'))
        .having(gt(count(), literal(5)))
        .build();
      expect(node.having).toBeDefined();
    });

    test('orderBy()', () => {
      const node = select(col('*'))
        .from('t')
        .orderBy(col('a'), 'DESC')
        .orderBy(col('b'))
        .build();
      expect(node.orderBy).toHaveLength(2);
      expect(node.orderBy![0].direction).toBe('DESC');
      expect(node.orderBy![1].direction).toBe('ASC'); // default
    });

    test('limit() and offset()', () => {
      const node = select(col('*')).from('t').limit(100).offset(50).build();
      expect(node.limit).toBe(100);
      expect(node.offset).toBe(50);
    });

    test('with() CTE', () => {
      const cte = select(count().as('cnt')).from('events').build();
      const node = select(col('cnt'))
        .with('counts', cte)
        .from('counts')
        .build();
      expect(node.ctes).toHaveLength(1);
      expect(node.ctes![0].name).toBe('counts');
    });

    test('arrayJoin()', () => {
      const node = select(col('person_id'), col('bucket'))
        .from('t')
        .arrayJoin(col('buckets'), 'bucket')
        .build();
      expect(node.arrayJoins).toHaveLength(1);
      expect(node.arrayJoins![0].itemAlias).toBe('bucket');
    });

    test('join methods: innerJoin, leftJoin, crossJoin', () => {
      const sub = select(col('*')).from('t2').build();
      const node = select(col('*'))
        .from('t1', 'a')
        .innerJoin('t2', 'b', eq(col('a.id'), col('b.id')))
        .leftJoin('t3', 'c', eq(col('a.id'), col('c.id')))
        .crossJoin(sub, 'd')
        .build();
      expect(node.joins).toHaveLength(3);
      expect(node.joins![0].type).toBe('INNER');
      expect(node.joins![1].type).toBe('LEFT');
      expect(node.joins![2].type).toBe('CROSS');
    });

    test('fluent chain returns same builder', () => {
      const builder = select(col('a'));
      const result = builder
        .from('t')
        .where(eq(col('a'), literal(1)))
        .groupBy(col('a'))
        .orderBy(col('a'))
        .limit(10);
      expect(result).toBe(builder);
    });
  });

  describe('unionAll()', () => {
    test('creates UnionAllNode', () => {
      const q1 = select(col('a')).from('t1').build();
      const q2 = select(col('b')).from('t2').build();
      const u = unionAll(q1, q2);
      expect(u.type).toBe('union_all');
      expect(u.queries).toHaveLength(2);
    });

    test('accepts QueryNode (nested union)', () => {
      const q1 = select(col('a')).from('t1').build();
      const q2 = select(col('b')).from('t2').build();
      const q3 = select(col('c')).from('t3').build();
      const u = unionAll(q1, unionAll(q2, q3));
      expect(u.queries).toHaveLength(2);
      expect(u.queries[1].type).toBe('union_all');
    });
  });

  describe('new expression factories', () => {
    test('parametricFunc() returns ParametricFuncCallExpr', () => {
      const pf = parametricFunc('windowFunnel', [literal(86400)], [col('cond1'), col('cond2')]);
      expect(pf.type).toBe('parametric_func');
      expect(pf.name).toBe('windowFunnel');
      expect(pf.params).toHaveLength(1);
      expect(pf.args).toHaveLength(2);
    });

    test('parametricFunc().as() creates AliasExpr', () => {
      const a = parametricFunc('quantile', [literal(0.5)], [col('x')]).as('median');
      expect(a.type).toBe('alias');
      expect(a.alias).toBe('median');
    });

    test('lambda() returns LambdaExpr', () => {
      const l = lambda(['x'], gt(col('x'), literal(0)));
      expect(l.type).toBe('lambda');
      expect(l.params).toEqual(['x']);
      expect(l.body.type).toBe('binary');
    });

    test('lambda() with multiple params', () => {
      const l = lambda(['x', 'y'], add(col('x'), col('y')));
      expect(l.params).toEqual(['x', 'y']);
    });

    test('interval() returns IntervalExpr', () => {
      const i = interval(7, 'DAY');
      expect(i.type).toBe('interval');
      expect(i.value).toBe(7);
      expect(i.unit).toBe('DAY');
    });

    test('interval().as() creates AliasExpr', () => {
      const a = interval(30, 'MINUTE').as('window');
      expect(a.type).toBe('alias');
      expect(a.alias).toBe('window');
    });

    test('namedParam() returns NamedParamExpr', () => {
      const np = namedParam('cohort_id', 'String', 'abc-123');
      expect(np.type).toBe('named_param');
      expect(np.key).toBe('cohort_id');
      expect(np.chType).toBe('String');
      expect(np.value).toBe('abc-123');
    });

    test('namedParam().as() creates AliasExpr', () => {
      const a = namedParam('my_param', 'UInt64', 42).as('val');
      expect(a.type).toBe('alias');
      expect(a.alias).toBe('val');
    });
  });

  describe('new ClickHouse functions', () => {
    test('jsonExtractString()', () => {
      const f = jsonExtractString(col('properties'), 'name');
      expect(f.name).toBe('JSONExtractString');
      expect(f.args).toHaveLength(2);
      expect(f.args[1]).toEqual(expect.objectContaining({ type: 'literal', value: 'name' }));
    });

    test('jsonExtractString() with nested keys', () => {
      const f = jsonExtractString(col('props'), 'user', 'address', 'city');
      expect(f.args).toHaveLength(4);
    });

    test('jsonExtractRaw()', () => {
      const f = jsonExtractRaw(col('properties'), 'data');
      expect(f.name).toBe('JSONExtractRaw');
      expect(f.args).toHaveLength(2);
    });

    test('jsonHas()', () => {
      const f = jsonHas(col('properties'), 'key');
      expect(f.name).toBe('JSONHas');
      expect(f.args).toHaveLength(2);
    });

    test('toFloat64OrZero()', () => {
      const f = toFloat64OrZero(col('value'));
      expect(f.name).toBe('toFloat64OrZero');
      expect(f.args).toHaveLength(1);
    });

    test('toDate()', () => {
      const f = toDate(col('timestamp'));
      expect(f.name).toBe('toDate');
      expect(f.args).toHaveLength(1);
    });

    test('parseDateTimeBestEffortOrZero()', () => {
      const f = parseDateTimeBestEffortOrZero(col('date_str'));
      expect(f.name).toBe('parseDateTimeBestEffortOrZero');
      expect(f.args).toHaveLength(1);
    });

    test('argMax()', () => {
      const f = argMax(col('value'), col('timestamp'));
      expect(f.name).toBe('argMax');
      expect(f.args).toHaveLength(2);
    });

    test('dictGetOrNull()', () => {
      const f = dictGetOrNull('person_overrides_dict', 'override_id', col('person_id'));
      expect(f.name).toBe('dictGetOrNull');
      expect(f.args).toHaveLength(3);
      expect(f.args[0]).toEqual(expect.objectContaining({ type: 'literal', value: 'person_overrides_dict' }));
      expect(f.args[1]).toEqual(expect.objectContaining({ type: 'literal', value: 'override_id' }));
    });

    test('lower()', () => {
      const f = lower(col('name'));
      expect(f.name).toBe('lower');
      expect(f.args).toHaveLength(1);
    });

    test('match()', () => {
      const f = match(col('url'), literal('^https://.*'));
      expect(f.name).toBe('match');
      expect(f.args).toHaveLength(2);
    });

    test('multiSearchAny()', () => {
      const f = multiSearchAny(col('text'), param('Array(String)', ['foo', 'bar']));
      expect(f.name).toBe('multiSearchAny');
      expect(f.args).toHaveLength(2);
    });

    test('coalesce()', () => {
      const f = coalesce(col('a'), col('b'), literal(0));
      expect(f.name).toBe('coalesce');
      expect(f.args).toHaveLength(3);
    });

    test('arrayExists() with lambda', () => {
      const l = lambda(['x'], gt(col('x'), literal(0)));
      const f = arrayExists(l, col('arr'));
      expect(f.name).toBe('arrayExists');
      expect(f.args).toHaveLength(2);
      expect(f.args[0]).toEqual(expect.objectContaining({ type: 'lambda' }));
    });

    test('arrayMax() with lambda', () => {
      const l = lambda(['x'], col('x'));
      const f = arrayMax(l, col('arr'));
      expect(f.name).toBe('arrayMax');
      expect(f.args).toHaveLength(2);
      expect(f.args[0]).toEqual(expect.objectContaining({ type: 'lambda' }));
    });
  });

  describe('mod()', () => {
    test('creates modulo BinaryExpr', () => {
      const m = mod(col('a'), literal(100));
      expect(m.type).toBe('binary');
      expect(m.op).toBe('%');
    });

    test('mod().as() creates AliasExpr', () => {
      const a = mod(col('hash'), literal(100)).as('bucket');
      expect(a.type).toBe('alias');
      expect(a.alias).toBe('bucket');
    });
  });

  describe('SelectBuilder.distinct()', () => {
    test('sets distinct flag', () => {
      const node = select(col('person_id')).distinct().from('events').build();
      expect(node.distinct).toBe(true);
    });

    test('returns same builder for chaining', () => {
      const builder = select(col('a'));
      expect(builder.distinct()).toBe(builder);
    });
  });

  describe('except()', () => {
    test('creates SetOperationNode with EXCEPT', () => {
      const q1 = select(col('id')).from('all_users').build();
      const q2 = select(col('id')).from('blocked_users').build();
      const e = except(q1, q2);
      expect(e.type).toBe('set_operation');
      expect(e.operator).toBe('EXCEPT');
      expect(e.queries).toHaveLength(2);
    });
  });
});
