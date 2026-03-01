import { describe, expect, test } from 'vitest';
import {
  add,
  and,
  any,
  argMax,
  argMaxIf,
  argMinIf,
  arrayCompact,
  arrayElement,
  arrayEnumerate,
  arrayExists,
  arrayFilter,
  arrayMax,
  arrayMin,
  arraySlice,
  arraySort,
  avg,
  avgIf,
  coalesce,
  col,
  count,
  countDistinct,
  countIf,
  dateDiff,
  dictGetOrNull,
  div,
  eq,
  escapeLikePattern,
  except,
  func,
  funcDistinct,
  greatest,
  groupArray,
  groupArrayIf,
  groupUniqArray,
  gt,
  gte,
  has,
  ifExpr,
  inArray,
  indexOf,
  inSubquery,
  interval,
  jsonExtractRaw,
  jsonExtractString,
  jsonHas,
  lambda,
  length,
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
  notEmpty,
  intersect,
  notInSubquery,
  now64,
  or,
  param,
  parametricFunc,
  parseDateTimeBestEffort,
  parseDateTimeBestEffortOrZero,
  quantile,
  raw,
  safeLike,
  safeNotLike,
  select,
  sipHash64,
  sub,
  subquery,
  tuple,
  sum,
  sumIf,
  toDate,
  toDateTime,
  toDateTime64,
  toFloat64OrZero,
  toInt32,
  toInt64,
  toString,
  toStartOfDay,
  toStartOfHour,
  toStartOfMonth,
  toStartOfWeek,
  toUInt32,
  toUInt64,
  toUnixTimestamp64Milli,
  toUUID,
  today,
  unionAll,
  uniqExact,
  like,
  notLike,
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

    test('argMinIf()', () => {
      const cond = eq(col('step'), literal(1));
      const f = argMinIf(col('value'), col('timestamp'), cond);
      expect(f.name).toBe('argMinIf');
      expect(f.args).toHaveLength(3);
    });

    test('argMaxIf()', () => {
      const cond = eq(col('step'), literal(1));
      const f = argMaxIf(col('value'), col('timestamp'), cond);
      expect(f.name).toBe('argMaxIf');
      expect(f.args).toHaveLength(3);
    });

    test('toInt64()', () => {
      const f = toInt64(col('timestamp'));
      expect(f.name).toBe('toInt64');
      expect(f.args).toHaveLength(1);
    });

    test('toUInt64()', () => {
      const f = toUInt64(col('timestamp'));
      expect(f.name).toBe('toUInt64');
      expect(f.args).toHaveLength(1);
    });

    test('toUnixTimestamp64Milli()', () => {
      const f = toUnixTimestamp64Milli(col('timestamp'));
      expect(f.name).toBe('toUnixTimestamp64Milli');
      expect(f.args).toHaveLength(1);
    });

    test('notEmpty()', () => {
      const f = notEmpty(col('arr'));
      expect(f.name).toBe('notEmpty');
      expect(f.args).toHaveLength(1);
    });

    test('greatest()', () => {
      const f = greatest(col('a'), col('b'), col('c'));
      expect(f.name).toBe('greatest');
      expect(f.args).toHaveLength(3);
    });

    test('indexOf()', () => {
      const f = indexOf(col('arr'), literal('x'));
      expect(f.name).toBe('indexOf');
      expect(f.args).toHaveLength(2);
    });

    test('arrayElement()', () => {
      const f = arrayElement(col('arr'), literal(1));
      expect(f.name).toBe('arrayElement');
      expect(f.args).toHaveLength(2);
    });

    test('sipHash64()', () => {
      const f = sipHash64(col('person_id'));
      expect(f.name).toBe('sipHash64');
      expect(f.args).toHaveLength(1);
    });

    test('ifExpr()', () => {
      const f = ifExpr(gt(col('x'), literal(0)), literal('positive'), literal('non-positive'));
      expect(f.name).toBe('if');
      expect(f.args).toHaveLength(3);
    });

    test('ifExpr().as() creates AliasExpr', () => {
      const a = ifExpr(gt(col('x'), literal(0)), literal(1), literal(0)).as('flag');
      expect(a.type).toBe('alias');
      expect(a.alias).toBe('flag');
    });

    test('arrayMin() without lambda', () => {
      const f = arrayMin(col('arr'));
      expect(f.name).toBe('arrayMin');
      expect(f.args).toHaveLength(1);
    });

    test('arrayMin() with lambda', () => {
      const l = lambda(['x'], col('x'));
      const f = arrayMin(l, col('arr'));
      expect(f.name).toBe('arrayMin');
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

  describe('arrayFilter with LambdaExpr', () => {
    test('arrayFilter() accepts string (backwards compat)', () => {
      const af = arrayFilter('x -> x > 0', col('arr'));
      expect(af.name).toBe('arrayFilter');
      expect(af.args).toHaveLength(2);
      expect(af.args[0]).toEqual(expect.objectContaining({ type: 'raw', sql: 'x -> x > 0' }));
    });

    test('arrayFilter() accepts LambdaExpr', () => {
      const l = lambda(['x'], gt(col('x'), literal(0)));
      const af = arrayFilter(l, col('arr'));
      expect(af.name).toBe('arrayFilter');
      expect(af.args).toHaveLength(2);
      expect(af.args[0]).toEqual(expect.objectContaining({ type: 'lambda' }));
    });
  });

  describe('interval with Expr value', () => {
    test('interval() accepts number (backwards compat)', () => {
      const i = interval(7, 'DAY');
      expect(i.type).toBe('interval');
      expect(i.value).toBe(7);
      expect(i.unit).toBe('DAY');
    });

    test('interval() accepts Expr', () => {
      const np = namedParam('days', 'UInt32', 7);
      const i = interval(np, 'DAY');
      expect(i.type).toBe('interval');
      expect(i.value).toEqual(expect.objectContaining({ type: 'named_param', key: 'days' }));
      expect(i.unit).toBe('DAY');
    });

    test('interval() with Expr still validates unit', () => {
      expect(() => interval(namedParam('x', 'UInt32', 1), 'INVALID')).toThrow(/Invalid interval unit/);
    });
  });

  describe('SQL utils', () => {
    test('escapeLikePattern escapes %, _, \\', () => {
      expect(escapeLikePattern('')).toBe('');
      expect(escapeLikePattern('hello')).toBe('hello');
      expect(escapeLikePattern('100%')).toBe('100\\%');
      expect(escapeLikePattern('user_name')).toBe('user\\_name');
      expect(escapeLikePattern('path\\to')).toBe('path\\\\to');
      expect(escapeLikePattern('%_\\')).toBe('\\%\\_\\\\');
    });

    test('safeLike() creates LIKE binary with escaped param', () => {
      const expr = safeLike(col('name'), 'test%value');
      expect(expr.type).toBe('binary');
      expect(expr.op).toBe('LIKE');
      expect(expr.right).toEqual(expect.objectContaining({
        type: 'param',
        chType: 'String',
        value: '%test\\%value%',
      }));
    });

    test('safeNotLike() creates NOT LIKE binary with escaped param', () => {
      const expr = safeNotLike(col('name'), 'test_value');
      expect(expr.type).toBe('binary');
      expect(expr.op).toBe('NOT LIKE');
      expect(expr.right).toEqual(expect.objectContaining({
        type: 'param',
        chType: 'String',
        value: '%test\\_value%',
      }));
    });
  });

  describe('HIGH priority function shortcuts', () => {
    test('length()', () => {
      const f = length(col('arr'));
      expect(f.name).toBe('length');
      expect(f.args).toHaveLength(1);
    });

    test('toStartOfDay()', () => {
      const f = toStartOfDay(col('ts'));
      expect(f.name).toBe('toStartOfDay');
      expect(f.args).toHaveLength(1);
    });

    test('toStartOfDay() with timezone', () => {
      const f = toStartOfDay(col('ts'), literal('UTC'));
      expect(f.name).toBe('toStartOfDay');
      expect(f.args).toHaveLength(2);
    });

    test('toStartOfHour()', () => {
      const f = toStartOfHour(col('ts'));
      expect(f.name).toBe('toStartOfHour');
      expect(f.args).toHaveLength(1);
    });

    test('toStartOfWeek()', () => {
      const f = toStartOfWeek(col('ts'));
      expect(f.name).toBe('toStartOfWeek');
      expect(f.args).toHaveLength(1);
    });

    test('toStartOfWeek() with mode and tz', () => {
      const f = toStartOfWeek(col('ts'), literal(1), literal('UTC'));
      expect(f.name).toBe('toStartOfWeek');
      expect(f.args).toHaveLength(3);
    });

    test('toStartOfMonth()', () => {
      const f = toStartOfMonth(col('ts'));
      expect(f.name).toBe('toStartOfMonth');
      expect(f.args).toHaveLength(1);
    });

    test('toDateTime()', () => {
      const f = toDateTime(col('str'));
      expect(f.name).toBe('toDateTime');
      expect(f.args).toHaveLength(1);
    });

    test('toDateTime() with timezone', () => {
      const f = toDateTime(col('str'), literal('UTC'));
      expect(f.name).toBe('toDateTime');
      expect(f.args).toHaveLength(2);
    });

    test('dateDiff() with Expr unit', () => {
      const f = dateDiff(literal('day'), col('start'), col('end'));
      expect(f.name).toBe('dateDiff');
      expect(f.args).toHaveLength(3);
      // Unit passed as Expr should be used as-is
      expect(f.args[0]).toEqual(expect.objectContaining({ type: 'literal', value: 'day' }));
    });

    test('dateDiff() with string unit (auto-wrapped in literal)', () => {
      const f = dateDiff('day', col('start'), col('end'));
      expect(f.name).toBe('dateDiff');
      expect(f.args).toHaveLength(3);
      // String unit should be auto-wrapped in literal()
      expect(f.args[0]).toEqual(expect.objectContaining({ type: 'literal', value: 'day' }));
    });
  });

  describe('MEDIUM priority function shortcuts', () => {
    test('toDateTime64()', () => {
      const f = toDateTime64(col('str'), literal(3));
      expect(f.name).toBe('toDateTime64');
      expect(f.args).toHaveLength(2);
    });

    test('toDateTime64() with timezone', () => {
      const f = toDateTime64(col('str'), literal(3), literal('UTC'));
      expect(f.name).toBe('toDateTime64');
      expect(f.args).toHaveLength(3);
    });

    test('has()', () => {
      const f = has(col('arr'), literal('x'));
      expect(f.name).toBe('has');
      expect(f.args).toHaveLength(2);
    });

    test('any()', () => {
      const f = any(col('val'));
      expect(f.name).toBe('any');
      expect(f.args).toHaveLength(1);
    });

    test('arraySlice() without len', () => {
      const f = arraySlice(col('arr'), literal(1));
      expect(f.name).toBe('arraySlice');
      expect(f.args).toHaveLength(2);
    });

    test('arraySlice() with len', () => {
      const f = arraySlice(col('arr'), literal(1), literal(5));
      expect(f.name).toBe('arraySlice');
      expect(f.args).toHaveLength(3);
    });

    test('parseDateTimeBestEffort()', () => {
      const f = parseDateTimeBestEffort(col('str'));
      expect(f.name).toBe('parseDateTimeBestEffort');
      expect(f.args).toHaveLength(1);
    });

    test('now64() with precision', () => {
      const f = now64(literal(3));
      expect(f.name).toBe('now64');
      expect(f.args).toHaveLength(1);
    });

    test('now64() without precision', () => {
      const f = now64();
      expect(f.name).toBe('now64');
      expect(f.args).toHaveLength(0);
    });

    test('toUInt32()', () => {
      const f = toUInt32(col('val'));
      expect(f.name).toBe('toUInt32');
      expect(f.args).toHaveLength(1);
    });

    test('toInt32()', () => {
      const f = toInt32(col('val'));
      expect(f.name).toBe('toInt32');
      expect(f.args).toHaveLength(1);
    });
  });

  describe('LOW priority function shortcuts', () => {
    test('groupUniqArray()', () => {
      const f = groupUniqArray(col('val'));
      expect(f.name).toBe('groupUniqArray');
      expect(f.args).toHaveLength(1);
    });

    test('arrayCompact()', () => {
      const f = arrayCompact(col('arr'));
      expect(f.name).toBe('arrayCompact');
      expect(f.args).toHaveLength(1);
    });

    test('arrayEnumerate()', () => {
      const f = arrayEnumerate(col('arr'));
      expect(f.name).toBe('arrayEnumerate');
      expect(f.args).toHaveLength(1);
    });

    test('toUUID()', () => {
      const f = toUUID(col('str'));
      expect(f.name).toBe('toUUID');
      expect(f.args).toHaveLength(1);
    });

    test('today()', () => {
      const f = today();
      expect(f.name).toBe('today');
      expect(f.args).toHaveLength(0);
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

  describe('SelectBuilder.addSelect()', () => {
    test('appends columns to existing select list', () => {
      const node = select(col('a'))
        .addSelect(col('b'), col('c'))
        .from('t')
        .build();
      expect(node.columns).toHaveLength(3);
      expect(node.columns[0]).toEqual(expect.objectContaining({ type: 'column', name: 'a' }));
      expect(node.columns[1]).toEqual(expect.objectContaining({ type: 'column', name: 'b' }));
      expect(node.columns[2]).toEqual(expect.objectContaining({ type: 'column', name: 'c' }));
    });

    test('skips undefined arguments', () => {
      const node = select(col('a'))
        .addSelect(undefined, col('b'), undefined)
        .from('t')
        .build();
      expect(node.columns).toHaveLength(2);
      expect(node.columns[1]).toEqual(expect.objectContaining({ type: 'column', name: 'b' }));
    });

    test('all undefined results in no change', () => {
      const node = select(col('a'))
        .addSelect(undefined, undefined)
        .from('t')
        .build();
      expect(node.columns).toHaveLength(1);
    });

    test('returns same builder for chaining', () => {
      const builder = select(col('a'));
      expect(builder.addSelect(col('b'))).toBe(builder);
    });

    test('works with aliased expressions', () => {
      const node = select(col('a'))
        .addSelect(count().as('total'))
        .from('t')
        .build();
      expect(node.columns).toHaveLength(2);
      expect(node.columns[1]).toEqual(expect.objectContaining({ type: 'alias', alias: 'total' }));
    });
  });

  describe('SelectBuilder.addWhere()', () => {
    test('sets WHERE when empty', () => {
      const node = select(col('*'))
        .from('t')
        .addWhere(eq(col('a'), literal(1)))
        .build();
      expect(node.where).toEqual(expect.objectContaining({ type: 'binary', op: '=' }));
    });

    test('ANDs with existing WHERE', () => {
      const node = select(col('*'))
        .from('t')
        .where(eq(col('a'), literal(1)))
        .addWhere(eq(col('b'), literal(2)))
        .build();
      expect(node.where).toEqual(expect.objectContaining({ type: 'binary', op: 'AND' }));
    });

    test('multiple addWhere calls chain correctly', () => {
      const node = select(col('*'))
        .from('t')
        .addWhere(eq(col('a'), literal(1)))
        .addWhere(eq(col('b'), literal(2)))
        .addWhere(eq(col('c'), literal(3)))
        .build();
      // Should be ((a=1 AND b=2) AND c=3)
      expect(node.where).toBeDefined();
      expect(node.where!.type).toBe('binary');
    });

    test('skips undefined arguments', () => {
      const node = select(col('*'))
        .from('t')
        .where(eq(col('a'), literal(1)))
        .addWhere(undefined, undefined)
        .build();
      // WHERE unchanged — still the original eq()
      expect(node.where).toEqual(expect.objectContaining({ type: 'binary', op: '=' }));
    });

    test('all undefined on empty WHERE leaves WHERE unset', () => {
      const node = select(col('*'))
        .from('t')
        .addWhere(undefined)
        .build();
      expect(node.where).toBeUndefined();
    });

    test('addWhere with multiple conditions ANDs them together', () => {
      const node = select(col('*'))
        .from('t')
        .addWhere(eq(col('a'), literal(1)), gt(col('b'), literal(0)))
        .build();
      expect(node.where).toEqual(expect.objectContaining({ type: 'binary', op: 'AND' }));
    });

    test('returns same builder for chaining', () => {
      const builder = select(col('*')).from('t');
      expect(builder.addWhere(eq(col('a'), literal(1)))).toBe(builder);
    });
  });

  describe('SelectBuilder.addGroupBy()', () => {
    test('sets GROUP BY when empty', () => {
      const node = select(col('a'), count())
        .from('t')
        .addGroupBy(col('a'))
        .build();
      expect(node.groupBy).toHaveLength(1);
    });

    test('appends to existing GROUP BY', () => {
      const node = select(col('a'), col('b'), count())
        .from('t')
        .groupBy(col('a'))
        .addGroupBy(col('b'))
        .build();
      expect(node.groupBy).toHaveLength(2);
      expect(node.groupBy![0]).toEqual(expect.objectContaining({ type: 'column', name: 'a' }));
      expect(node.groupBy![1]).toEqual(expect.objectContaining({ type: 'column', name: 'b' }));
    });

    test('skips undefined arguments', () => {
      const node = select(col('a'), count())
        .from('t')
        .groupBy(col('a'))
        .addGroupBy(undefined, col('b'), undefined)
        .build();
      expect(node.groupBy).toHaveLength(2);
    });

    test('all undefined results in no change', () => {
      const node = select(col('a'), count())
        .from('t')
        .addGroupBy(undefined)
        .build();
      expect(node.groupBy).toBeUndefined();
    });

    test('returns same builder for chaining', () => {
      const builder = select(col('a'), count()).from('t');
      expect(builder.addGroupBy(col('a'))).toBe(builder);
    });
  });

  describe('SelectBuilder.addHaving()', () => {
    test('sets HAVING when empty', () => {
      const node = select(col('a'), count().as('cnt'))
        .from('t')
        .groupBy(col('a'))
        .addHaving(gt(count(), literal(5)))
        .build();
      expect(node.having).toBeDefined();
    });

    test('ANDs with existing HAVING', () => {
      const node = select(col('a'), count().as('cnt'))
        .from('t')
        .groupBy(col('a'))
        .having(gt(count(), literal(5)))
        .addHaving(lt(count(), literal(100)))
        .build();
      expect(node.having).toEqual(expect.objectContaining({ type: 'binary', op: 'AND' }));
    });

    test('returns same builder for chaining', () => {
      const builder = select(col('a'), count()).from('t').groupBy(col('a'));
      expect(builder.addHaving(gt(count(), literal(1)))).toBe(builder);
    });
  });

  describe('SelectBuilder.clone()', () => {
    test('creates independent copy', () => {
      const original = select(col('a'), col('b'))
        .from('events')
        .where(eq(col('a'), literal(1)))
        .groupBy(col('a'));

      const cloned = original.clone();

      // Mutate clone
      cloned.addSelect(col('c'));
      cloned.addWhere(eq(col('b'), literal(2)));
      cloned.addGroupBy(col('b'));

      // Original should be unaffected
      const origNode = original.build();
      const cloneNode = cloned.build();

      expect(origNode.columns).toHaveLength(2);
      expect(cloneNode.columns).toHaveLength(3);

      expect(origNode.groupBy).toHaveLength(1);
      expect(cloneNode.groupBy).toHaveLength(2);

      // WHERE: original has eq only, clone has AND
      expect(origNode.where).toEqual(expect.objectContaining({ type: 'binary', op: '=' }));
      expect(cloneNode.where).toEqual(expect.objectContaining({ type: 'binary', op: 'AND' }));
    });

    test('clone preserves all builder state', () => {
      const cte = select(count().as('cnt')).from('events').build();

      const original = select(col('a'))
        .distinct()
        .with('counts', cte)
        .from('events', 'e')
        .innerJoin('t2', 'j', eq(col('e.id'), col('j.id')))
        .where(eq(col('a'), literal(1)))
        .prewhere(gt(col('ts'), literal('2024-01-01')))
        .groupBy(col('a'))
        .having(gt(count(), literal(5)))
        .orderBy(col('a'), 'DESC')
        .limit(100)
        .offset(50)
        .arrayJoin(col('arr'), 'item');

      const cloned = original.clone();
      const origNode = original.build();
      const cloneNode = cloned.build();

      // Compare data structure via JSON (clone strips .as() helper methods, which is fine)
      expect(JSON.parse(JSON.stringify(cloneNode))).toEqual(JSON.parse(JSON.stringify(origNode)));
      // But they should not be the same object
      expect(cloneNode).not.toBe(origNode);
      expect(cloneNode.columns).not.toBe(origNode.columns);
    });

    test('mutating original does not affect clone', () => {
      const original = select(col('a')).from('t');
      const cloned = original.clone();

      original.addSelect(col('b'));

      expect(original.build().columns).toHaveLength(2);
      expect(cloned.build().columns).toHaveLength(1);
    });

    test('query branching pattern works', () => {
      // Pattern from the issue: build base query, then branch
      const base = select(col('series_idx'), col('bucket'), count().as('total'))
        .from('events')
        .where(eq(col('project_id'), param('UUID', '123')))
        .groupBy(col('bucket'));

      const arm1 = base.build();
      const arm2 = base.clone()
        .addSelect(col('breakdown_value'))
        .addGroupBy(col('breakdown_value'))
        .build();

      // arm1: 3 columns, 1 groupBy
      expect(arm1.columns).toHaveLength(3);
      expect(arm1.groupBy).toHaveLength(1);

      // arm2: 4 columns, 2 groupBy
      expect(arm2.columns).toHaveLength(4);
      expect(arm2.groupBy).toHaveLength(2);

      // base should still have original state (3 cols, 1 groupBy)
      // Note: base.build() was called before clone modifications,
      // but base itself was mutated... let's verify
      // Actually base was NOT mutated since clone() creates a new builder
      expect(base.build().columns).toHaveLength(3);
      expect(base.build().groupBy).toHaveLength(1);
    });
  });

  describe('tuple()', () => {
    test('creates TupleExpr with elements', () => {
      const t = tuple(col('a'), col('b'));
      expect(t.type).toBe('tuple');
      expect(t.elements).toHaveLength(2);
      expect(t.elements[0]).toEqual(expect.objectContaining({ type: 'column', name: 'a' }));
      expect(t.elements[1]).toEqual(expect.objectContaining({ type: 'column', name: 'b' }));
    });

    test('tuple().as() creates AliasExpr', () => {
      const a = tuple(col('a'), col('b')).as('pair');
      expect(a.type).toBe('alias');
      expect(a.alias).toBe('pair');
    });

    test('empty tuple', () => {
      const t = tuple();
      expect(t.type).toBe('tuple');
      expect(t.elements).toHaveLength(0);
    });

    test('single element tuple', () => {
      const t = tuple(col('x'));
      expect(t.type).toBe('tuple');
      expect(t.elements).toHaveLength(1);
    });
  });

  describe('quantile()', () => {
    test('creates ParametricFuncCallExpr', () => {
      const q = quantile(0.5, col('duration'));
      expect(q.type).toBe('parametric_func');
      expect(q.name).toBe('quantile');
      expect(q.params).toHaveLength(1);
      expect(q.params[0]).toEqual(expect.objectContaining({ type: 'literal', value: 0.5 }));
      expect(q.args).toHaveLength(1);
    });

    test('quantile().as() creates AliasExpr', () => {
      const a = quantile(0.5, col('x')).as('median');
      expect(a.type).toBe('alias');
      expect(a.alias).toBe('median');
    });
  });

  describe('safeLike mode parameter', () => {
    test('safeLike() default mode is contains (%val%)', () => {
      const expr = safeLike(col('x'), 'test');
      expect(expr.right).toEqual(expect.objectContaining({
        type: 'param',
        chType: 'String',
        value: '%test%',
      }));
    });

    test('safeLike() contains mode wraps %val%', () => {
      const expr = safeLike(col('x'), 'test', 'contains');
      expect(expr.right).toEqual(expect.objectContaining({
        value: '%test%',
      }));
    });

    test('safeLike() startsWith mode wraps val%', () => {
      const expr = safeLike(col('x'), 'test', 'startsWith');
      expect(expr.right).toEqual(expect.objectContaining({
        value: 'test%',
      }));
    });

    test('safeLike() endsWith mode wraps %val', () => {
      const expr = safeLike(col('x'), 'test', 'endsWith');
      expect(expr.right).toEqual(expect.objectContaining({
        value: '%test',
      }));
    });

    test('safeLike() startsWith with special chars escapes properly', () => {
      const expr = safeLike(col('x'), '100%', 'startsWith');
      expect(expr.right).toEqual(expect.objectContaining({
        value: '100\\%%',
      }));
    });

    test('safeNotLike() startsWith mode', () => {
      const expr = safeNotLike(col('x'), 'prefix', 'startsWith');
      expect(expr.op).toBe('NOT LIKE');
      expect(expr.right).toEqual(expect.objectContaining({
        value: 'prefix%',
      }));
    });

    test('safeNotLike() endsWith mode', () => {
      const expr = safeNotLike(col('x'), 'suffix', 'endsWith');
      expect(expr.op).toBe('NOT LIKE');
      expect(expr.right).toEqual(expect.objectContaining({
        value: '%suffix',
      }));
    });
  });

  describe('inSubquery/notInSubquery with QueryNode', () => {
    test('inSubquery() accepts SelectNode (backward compat)', () => {
      const q = select(col('id')).from('t').build();
      const expr = inSubquery(col('a'), q);
      expect(expr.type).toBe('in');
      expect(expr.negated).toBeUndefined();
    });

    test('inSubquery() accepts SetOperationNode (INTERSECT)', () => {
      const q1 = select(col('id')).from('t1').build();
      const q2 = select(col('id')).from('t2').build();
      const expr = inSubquery(col('a'), intersect(q1, q2));
      expect(expr.type).toBe('in');
      expect(expr.target).toEqual(expect.objectContaining({
        type: 'set_operation',
        operator: 'INTERSECT',
      }));
    });

    test('notInSubquery() accepts SetOperationNode', () => {
      const q1 = select(col('id')).from('t1').build();
      const q2 = select(col('id')).from('t2').build();
      const expr = notInSubquery(col('a'), intersect(q1, q2));
      expect(expr.type).toBe('in');
      expect(expr.negated).toBe(true);
      expect(expr.target).toEqual(expect.objectContaining({
        type: 'set_operation',
      }));
    });
  });

  describe('input validation (security)', () => {
    test('lambda() rejects invalid param names', () => {
      expect(() => lambda(['x; DROP TABLE'], gt(col('x'), literal(0)))).toThrow(
        /Invalid lambda parameter name/,
      );
      expect(() => lambda([''], gt(col('x'), literal(0)))).toThrow(
        /Invalid lambda parameter name/,
      );
    });

    test('lambda() accepts valid param names', () => {
      expect(() => lambda(['x'], gt(col('x'), literal(0)))).not.toThrow();
      expect(() => lambda(['_x', 'y_1', 'ABC'], gt(col('x'), literal(0)))).not.toThrow();
    });

    test('interval() rejects invalid units', () => {
      expect(() => interval(1, 'INVALID')).toThrow(/Invalid interval unit/);
      expect(() => interval(1, '')).toThrow(/Invalid interval unit/);
      expect(() => interval(1, 'day')).toThrow(/Invalid interval unit/); // case-sensitive
    });

    test('interval() accepts all valid units', () => {
      for (const unit of ['SECOND', 'MINUTE', 'HOUR', 'DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR']) {
        expect(() => interval(1, unit)).not.toThrow();
      }
    });

    test('namedParam() rejects invalid key', () => {
      expect(() => namedParam('', 'String', 'v')).toThrow(/Invalid named parameter key/);
      expect(() => namedParam('a b', 'String', 'v')).toThrow(/Invalid named parameter key/);
      expect(() => namedParam('key}', 'String', 'v')).toThrow(/Invalid named parameter key/);
    });

    test('namedParam() rejects invalid chType', () => {
      expect(() => namedParam('key', '', 'v')).toThrow(/Invalid ClickHouse type/);
      expect(() => namedParam('key', 'String}', 'v')).toThrow(/Invalid ClickHouse type/);
      expect(() => namedParam('key', 'Type(a}{b)', 'v')).toThrow(/Invalid ClickHouse type/);
    });

    test('namedParam() accepts valid types', () => {
      expect(() => namedParam('k', 'String', 'v')).not.toThrow();
      expect(() => namedParam('k', 'Array(String)', 'v')).not.toThrow();
      expect(() => namedParam('k', 'DateTime64(3)', 'v')).not.toThrow();
      expect(() => namedParam('k', 'Nullable(UInt64)', 'v')).not.toThrow();
    });
  });

});
